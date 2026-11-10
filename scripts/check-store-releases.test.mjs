import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkStoreReleases, pendingArtifacts, readReleaseArtifact } from './check-store-releases.mjs';
import { MAX_AGE_MS } from './store-availability.mjs';
import { ENV, NOW, fixture, response } from './test-support/store-release.mjs';

const check = (mock, options = {}) => checkStoreReleases(ENV, { ...mock, now: NOW, ...options });
const sends = mock => mock.state.calls.filter(call => call.url.includes('gridgo-api'));
const removed = mock => mock.state.calls.filter(call => call.url.includes('api.github.com') && call.options.method === 'DELETE');

test('scheduled dry run exercises both store gates without announcing or deleting pending records', async () => {
  const mock = fixture();
  assert.deepEqual(await check(mock), { pending: 2, available: 2, accepted: 0 });
  assert.equal(sends(mock).length, 0);
  assert.equal(removed(mock).length, 0);
  // GitHub bearer stops at GitHub; signed artifact downloads have no auth header.
  for (const call of mock.state.calls.filter(call => call.url.includes('artifacts.example.invalid'))) {
    assert.equal(call.options.headers, undefined);
  }
});

test('unavailable stores never reach announce endpoint even with send enabled', async () => {
  const mock = fixture();
  mock.state.lifecycle.alpha.releases[0].releaseLifecycleState = 'RELEASE_LIFECYCLE_STATE_IN_REVIEW';
  mock.state.detail.data.attributes.externalBuildState = 'WAITING_FOR_BETA_REVIEW';
  assert.deepEqual(await check(mock, { dryRun: false }), { pending: 2, available: 0, accepted: 0 });
  assert.equal(sends(mock).length, 0);
  assert.equal(removed(mock).length, 0);
});

test('gated send uses exact app/version/channel and removes pending only after API acceptance', async () => {
  const mock = fixture();
  assert.deepEqual(await check(mock, { dryRun: false }), { pending: 2, available: 2, accepted: 2 });
  assert.deepEqual(sends(mock).map(call => JSON.parse(call.options.body)), [
    { app: 'client', version: '1.0.42', channel: 'play' }, { app: 'client', version: '1.0.43', channel: 'ios' },
  ]);
  assert.equal(removed(mock).length, 2);
  for (const call of removed(mock)) {
    assert.ok(mock.state.calls.indexOf(call) > mock.state.calls.indexOf(sends(mock)[0]));
  }
});

test('API failure or missing announcement credential retains pending record for a later check', async () => {
  const mock = fixture(); mock.state.announceStatus = 503;
  assert.equal((await check(mock, { dryRun: false })).accepted, 0);
  assert.equal(removed(mock).length, 0);
  const missingToken = fixture();
  await checkStoreReleases({ ...ENV, RELEASE_ANNOUNCE_TOKEN: '' }, { ...missingToken, now: NOW, dryRun: false });
  assert.equal(sends(missingToken).length, 0);
  assert.equal(removed(missingToken).length, 0);
});

test('cleanup failure retries safely using existing API app/version/channel de-duplication', async () => {
  const mock = fixture();
  for (const id of [301, 302]) mock.state.overrides.set(`/repos/example/app/actions/artifacts/${id}`, async () => response({}, 500));
  await check(mock, { dryRun: false }); await check(mock, { dryRun: false });
  assert.equal(sends(mock).length, 4);
  assert.equal(mock.state.notices.size, 2); // simulated API idempotency keys
});

test('seven-day expiry is silent and future records, wrong channels and malformed artifacts are ignored', async () => {
  for (const patch of [{ queuedAt: new Date(NOW - MAX_AGE_MS).toISOString() }, { channel: 'apk' },
    { queuedAt: new Date(NOW + 1000).toISOString() }, { version: null }]) {
    const mock = fixture();
    Object.assign(mock.state.releases.play, patch); Object.assign(mock.state.releases.ios, patch);
    assert.deepEqual(await check(mock, { dryRun: false }), { pending: 0, available: 0, accepted: 0 });
    assert.equal(sends(mock).length, 0);
  }
  const corrupt = fixture(); corrupt.readArtifact = async () => { throw new Error('Corrupt ZIP'); };
  assert.equal((await check(corrupt, { dryRun: false })).pending, 0);
});

test('ignores PR/non-main/wrong-workflow/failed/old runs without downloading artifacts', async () => {
  for (const patch of [{ head_branch: 'feature' }, { event: 'pull_request' }, { path: '.github/workflows/untrusted.yml' },
    { conclusion: 'failure' }, { created_at: new Date(NOW - MAX_AGE_MS).toISOString() }]) {
    const mock = fixture();
    for (const workflow of ['android-release.yml', 'ios-testflight.yml']) {
      mock.state.overrides.set(`/repos/example/app/actions/workflows/${workflow}/runs`, async () => response({ workflow_runs: [{
        id: 201, head_branch: 'main', event: 'workflow_dispatch', conclusion: 'success',
        path: `.github/workflows/${workflow}`, created_at: new Date(NOW - 3600000).toISOString(), ...patch,
      }] }));
    }
    assert.equal((await check(mock, { dryRun: false })).pending, 0);
    assert.equal(mock.state.calls.some(call => call.url.endsWith('/zip')), false);
  }
});

test('expired or oversized artifacts are ignored', async () => {
  for (const patch of [{ expired: true }, { size_in_bytes: 65537 }]) {
    const mock = fixture();
    for (const id of [201, 202]) mock.state.overrides.set(`/repos/example/app/actions/runs/${id}/artifacts`, async () => response({
      artifacts: [{ id: 301, name: `pending-store-release-${id === 201 ? 'play' : 'ios'}`, expired: false, size_in_bytes: 100, ...patch }],
    }));
    assert.equal((await check(mock)).pending, 0);
  }
});

test('workflow run pagination discovers older pending uploads', async () => {
  const mock = fixture();
  const path = '/repos/example/app/actions/workflows/android-release.yml/runs';
  mock.state.overrides.set(path, async url => response({ workflow_runs: new URL(url).searchParams.get('page') === '1'
    ? Array.from({ length: 100 }, () => ({ head_branch: 'ignored' })) : [{ id: 201, head_branch: 'main',
      event: 'workflow_dispatch', conclusion: 'success', path: '.github/workflows/android-release.yml',
      created_at: new Date(NOW - 3600000).toISOString() }] }));
  assert.equal((await pendingArtifacts(ENV, mock.transport, NOW, mock.readArtifact)).length, 2);
});

test('archive reader reads bounded JSON only and cleans temporary files', async () => {
  const zip = execFileSync('python3', ['-c', 'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr("release.json",\'{"app":"client"}\'); z.close(); sys.stdout.buffer.write(b.getvalue())']);
  assert.deepEqual(await readReleaseArtifact(zip), { app: 'client' });
  await assert.rejects(readReleaseArtifact(Buffer.from('invalid zip')));
  await assert.rejects(readReleaseArtifact(Buffer.alloc(65537)));
});

test('workflow only runs trusted main code; default manual run is dry; schedule is bounded and serialized', () => {
  const workflow = readFileSync(new URL('../.github/workflows/store-release-notices.yml', import.meta.url), 'utf8');
  for (const text of ["cron: '17,47 * * * *'", 'cancel-in-progress: false', 'timeout-minutes: 10',
    "if: github.ref == 'refs/heads/main'", 'ref: main', 'default: true', "github.event_name == 'schedule' && '--send'", 'node scripts/check-store-releases.mjs']) {
    assert.ok(workflow.includes(text), text);
  }
  assert.equal(workflow.includes('pull_request'), false);
  assert.ok(workflow.includes('group: play-store-access'));
  assert.ok(workflow.includes('queue: max'));
  const android = readFileSync(new URL('../.github/workflows/android-release.yml', import.meta.url), 'utf8');
  assert.ok(android.includes("github.event.inputs.play_bundle == 'true' && 'play-store-access'"));
  assert.ok(android.includes("cancel-in-progress: ${{ github.event.inputs.play_bundle != 'true' }}"));
  assert.ok(android.includes("queue: ${{ github.event.inputs.play_bundle == 'true' && 'max' || 'single' }}"));
});
