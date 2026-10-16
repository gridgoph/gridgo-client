import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** What each channel's notice follows, for the failure message. */
const PUBLISHED = {
  apk: 'The APK is already published',
  play: 'The bundle is already on Google Play',
  ios: 'The build is already in TestFlight',
};

/**
 * Publishing already succeeded. Notification failures must remain advisory.
 *
 * RELEASE_CHANNEL names the install channel the notice is for (gridgo-api
 * docs/RELEASE_ANNOUNCEMENTS_API.md): unset is the APK notice, sent exactly as
 * before with no `channel`; `play` and `ios` follow a store upload.
 */
export async function announceRelease(env = process.env, fetchImpl = fetch) {
  const channel = env.RELEASE_CHANNEL || 'apk';
  if (!Object.hasOwn(PUBLISHED, channel)) return { level: 'warning', message: 'Release push skipped: RELEASE_CHANNEL must be apk, play or ios.' };
  if (!env.RELEASE_ANNOUNCE_TOKEN) return { level: 'notice', message: 'Release push skipped: RELEASE_ANNOUNCE_TOKEN is not set.' };
  const body = { app: env.RELEASE_APP, version: env.RELEASE_VERSION };
  if (channel !== 'apk') body.channel = channel;
  try {
    const response = await fetchImpl('https://gridgo-api.talasora.com/release-announcements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RELEASE_ANNOUNCE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (response.ok) return { level: 'notice', message: 'Release push accepted (repeated versions do not send again).' };
    return { level: 'warning', message: `Release push failed (HTTP ${response.status}). ${PUBLISHED[channel]}; retry the announcement through firstmate.` };
  } catch {
    // Do not print request headers, response bodies, or transport exceptions.
    return { level: 'warning', message: `Release push failed or timed out. ${PUBLISHED[channel]}; retry the announcement through firstmate.` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await announceRelease();
  console.log(`::${result.level}::${result.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Release notification\n\n${result.level === 'warning' ? '**Warning:** ' : ''}${result.message}\n`);
  }
}
