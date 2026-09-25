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
    // The verifier pipes the store password into keytool under `set -o pipefail`,
    // and the real keytool reads it. A fake that exits without reading lets a
    // slow `printf` hit a closed pipe: it dies of SIGPIPE, pipefail reports that
    // as a keytool failure, and on a loaded runner the test fails with "keytool
    // could not read alias" before the check it is about. Drain stdin like the
    // real tool does.
    executable(join(bin, "keytool"), `cat >/dev/null\necho "SHA256: AA"`);
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
        EXPO_PUBLIC_CARTO_API_KEY: "fixture-carto-key",
        FAKE_BUNDLE_CONTENT:
          "https://api.fixture.invalid https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=fixture-carto-key",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "the production Clerk publishable key is not in assets/index.android.bundle",
    );
  });

  it("fails when the CARTO tile URL has no key query", () => {
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
        EXPO_PUBLIC_CARTO_API_KEY: "fixture-carto-key",
        FAKE_BUNDLE_CONTENT:
          "https://api.fixture.invalid pk_live_fixture_value https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the CARTO tile URL in assets/index.android.bundle is missing the ?key= query");
    expect(result.stderr).not.toContain("fixture-carto-key");
  });

  it("fails when some other ?key= is present but the CARTO key is not", () => {
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
        EXPO_PUBLIC_CARTO_API_KEY: "fixture-carto-key",
        FAKE_BUNDLE_CONTENT:
          "https://api.fixture.invalid pk_live_fixture_value https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png https://example.invalid/?key=unrelated",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "the CARTO basemap key is not in assets/index.android.bundle",
    );
    expect(result.stderr).not.toContain("fixture-carto-key");
  });
});
