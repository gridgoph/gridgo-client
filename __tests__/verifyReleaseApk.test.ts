import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const root = join(__dirname, "..");
const verifyScript = join(root, "scripts", "verify-release-apk.sh");

function executable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  chmodSync(path, 0o755);
}

describe("release APK verification", () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "gridgo-client-apk-"));
    const bin = join(fixtureRoot, "bin");
    mkdirSync(bin);

    executable(
      join(bin, "apksigner"),
      `if [[ "$*" == *"--print-certs"* ]]; then
  echo "Signer #1 certificate SHA-256 digest: aa"
fi`,
    );
    executable(join(bin, "keytool"), `echo "SHA256: AA"`);
    executable(join(bin, "unzip"), `printf '%s' "\${FAKE_BUNDLE_CONTENT:-}"`);
    writeFileSync(join(fixtureRoot, "fake.apk"), "fixture");
    writeFileSync(join(fixtureRoot, "release.jks"), "fixture");
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("fails when the Clerk publishable value is absent from the bundle", () => {
    const result = spawnSync("bash", [verifyScript, join(fixtureRoot, "fake.apk")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(fixtureRoot, "bin")}${delimiter}${process.env.PATH ?? ""}`,
        ANDROID_HOME: join(fixtureRoot, "missing-android-sdk"),
        ANDROID_SDK_ROOT: join(fixtureRoot, "missing-android-sdk"),
        ANDROID_KEYSTORE_PATH: join(fixtureRoot, "release.jks"),
        ANDROID_KEYSTORE_PASSWORD: "fixture-password",
        ANDROID_KEY_ALIAS: "fixture-alias",
        EXPO_PUBLIC_API_URL: "https://api.fixture.invalid",
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture_value",
        FAKE_BUNDLE_CONTENT: "https://api.fixture.invalid",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "the production Clerk publishable key is not in assets/index.android.bundle",
    );
  });
});
