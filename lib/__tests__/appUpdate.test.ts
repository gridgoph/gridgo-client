import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  APP_UPDATE_SOURCE,
  describeInstalledBuild,
  describePrompt,
  fetchLatestRelease,
  installedBuild,
  justUpdated,
  newerRelease,
  parseForcedVersionCode,
  releaseBuildFromTag,
  shouldCheckForUpdate,
  shouldShowUpdatePrompt,
} from "@/lib/appUpdate";

const release = { platform: "android", expoGo: false, dev: false, forcedVersionCode: null };

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("reading a release tag", () => {
  it("takes the run number from the tag CI writes", () => {
    expect(releaseBuildFromTag("v1.0.95")).toEqual({ versionCode: 95, versionName: "1.0.95" });
    expect(releaseBuildFromTag("1.2.300")).toEqual({ versionCode: 300, versionName: "1.2.300" });
  });

  it("ignores any tag CI would not have written", () => {
    for (const tag of ["v1.0", "latest", "v1.0.95-rc1", "", "v1.0.0", 95, null, undefined]) {
      expect(releaseBuildFromTag(tag)).toBeNull();
    }
  });
});

describe("the build on this phone", () => {
  it("is the stamped release build", () => {
    expect(installedBuild({ ...release, versionName: "1.0.95", versionCode: 95 })).toEqual({
      versionCode: 95,
      versionName: "1.0.95",
    });
  });

  it("is nothing for a build CI did not stamp", () => {
    // A local `assembleRelease` keeps app.json's version and versionCode 1.
    expect(installedBuild({ ...release, versionName: "1.0.0", versionCode: 1 })).toBeNull();
    expect(installedBuild({ ...release, versionName: "1.0.95", versionCode: 94 })).toBeNull();
    expect(installedBuild({ ...release, versionName: undefined, versionCode: undefined })).toBeNull();
  });

  it("is nothing in Expo Go, a development build, or off Android", () => {
    const stamped = { versionName: "1.0.95", versionCode: 95 };
    expect(installedBuild({ ...release, ...stamped, expoGo: true })).toBeNull();
    expect(installedBuild({ ...release, ...stamped, dev: true })).toBeNull();
    expect(installedBuild({ ...release, ...stamped, platform: "ios" })).toBeNull();
    expect(installedBuild({ ...release, ...stamped, platform: "web" })).toBeNull();
  });

  it("is the forced build in Expo Go when the dev override is set", () => {
    expect(
      installedBuild({
        ...release,
        expoGo: true,
        dev: true,
        versionName: "1.0.0",
        versionCode: 1,
        forcedVersionCode: 1,
      }),
    ).toEqual({ versionCode: 1, versionName: "1.0.1" });
  });

  it("keeps the override on Android only", () => {
    expect(
      installedBuild({
        ...release,
        platform: "web",
        versionName: "1.0.0",
        versionCode: 1,
        forcedVersionCode: 1,
      }),
    ).toBeNull();
  });

  it("reads the override as a whole number or not at all", () => {
    expect(parseForcedVersionCode("1")).toBe(1);
    expect(parseForcedVersionCode(" 94 ")).toBe(94);
    for (const raw of [undefined, null, "", "0", "-1", "1.5", "yes"]) {
      expect(parseForcedVersionCode(raw)).toBeNull();
    }
  });
});

describe("reading the latest release", () => {
  it("asks GitHub for this app's latest release, naming itself", async () => {
    const fetchImpl = jest.fn(async () => response(200, { tag_name: "v1.0.96" }));
    await expect(fetchLatestRelease(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      latest: { versionCode: 96, versionName: "1.0.96" },
      answered: true,
      detail: "latest release is 1.0.96",
    });
    // GitHub answers a request with no User-Agent with 403, the same status as
    // its rate limit, so the read cannot leave it to the HTTP stack.
    expect(fetchImpl).toHaveBeenCalledWith(
      APP_UPDATE_SOURCE.latestReleaseUrl,
      expect.objectContaining({
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": APP_UPDATE_SOURCE.userAgent,
        },
      }),
    );
  });

  it("answers nothing rate-limited, or for a release it cannot read, and says why", async () => {
    const answers: [() => Promise<Response>, string][] = [
      [async () => response(403, { message: "API rate limit exceeded" }), "GitHub answered HTTP 403"],
      [async () => response(429, {}), "GitHub answered HTTP 429"],
      [async () => response(404, { message: "Not Found" }), "GitHub answered HTTP 404"],
      [async () => response(200, null), "GitHub answered an empty body"],
      [async () => response(200, { tag_name: "nightly" }), 'tag "nightly" is not a CI release'],
      [
        async () => response(200, { tag_name: "v1.0.96", prerelease: true }),
        "release v1.0.96 is not final",
      ],
      [
        async () => ({ ok: true, status: 200, json: async () => JSON.parse("<html>") }) as Response,
        "unreadable release body",
      ],
    ];
    for (const [answer, detail] of answers) {
      const read = await fetchLatestRelease(answer as unknown as typeof fetch);
      expect(read).toMatchObject({ latest: null, answered: true });
      expect(read.detail).toContain(detail);
    }
  });

  it("tells an unanswered read from an answered one", async () => {
    const offline = async () => {
      throw new TypeError("Network request failed");
    };
    await expect(fetchLatestRelease(offline as unknown as typeof fetch)).resolves.toEqual({
      latest: null,
      answered: false,
      detail: "no answer (Network request failed)",
    });
  });

  it("gives up on a read that never answers", async () => {
    const hung = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    await expect(
      fetchLatestRelease(hung as unknown as typeof fetch, { timeoutMs: 5 }),
    ).resolves.toMatchObject({ latest: null, answered: false });
  });
});

describe("the development log", () => {
  const expoGo = { ...release, expoGo: true, dev: true, versionName: "1.0.0", versionCode: 1 };

  it("says the override reached the app, or that it did not", () => {
    const forced = { ...expoGo, forcedVersionCode: 90 };
    expect(describeInstalledBuild(forced, installedBuild(forced))).toBe(
      "installed 1.0.90 (versionCode 90, forced by override)",
    );
    expect(describeInstalledBuild(expoGo, installedBuild(expoGo))).toBe(
      "off: Expo Go and EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set",
    );
    const ios = { ...expoGo, platform: "ios", forcedVersionCode: 90 };
    expect(describeInstalledBuild(ios, installedBuild(ios))).toBe("off: ios cannot install an APK");
  });

  it("says why the prompt is or is not up", () => {
    const installed = { versionCode: 90, versionName: "1.0.90" };
    const latest = { versionCode: 95, versionName: "1.0.95" };
    const now = Date.UTC(2026, 8, 24, 3);
    expect(describePrompt({ installed, latest, dismissed: null, now }, true)).toBe(
      "offering 1.0.95 over 1.0.90",
    );
    expect(describePrompt({ installed: latest, latest, dismissed: null, now }, false)).toBe(
      "not offering: 1.0.95 is already the latest",
    );
    expect(
      describePrompt({ installed, latest, dismissed: { versionCode: 95, at: now }, now }, false),
    ).toBe('not offering 1.0.95 yet: "Later" was tapped for 95 less than 4 hours ago');
  });
});

describe("how often to look", () => {
  const now = Date.UTC(2026, 8, 24, 3);

  it("always looks on a fresh launch", () => {
    expect(shouldCheckForUpdate(null, now)).toBe(true);
  });

  it("looks again only once the interval has passed", () => {
    expect(shouldCheckForUpdate(now - 60_000, now)).toBe(false);
    expect(shouldCheckForUpdate(now - APP_UPDATE_CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it("is not silenced by a clock set backwards", () => {
    expect(shouldCheckForUpdate(now + 60_000, now)).toBe(true);
  });
});

describe("the update prompt", () => {
  const installed = { versionCode: 95, versionName: "1.0.95" };
  const latest = { versionCode: 96, versionName: "1.0.96" };
  const now = Date.UTC(2026, 8, 24, 3);
  const later = { versionCode: 96, at: now };

  it("shows only while a newer release exists", () => {
    expect(shouldShowUpdatePrompt({ installed, latest, dismissed: null, now })).toBe(true);
    expect(shouldShowUpdatePrompt({ installed, latest: installed, dismissed: null, now })).toBe(
      false,
    );
    expect(
      shouldShowUpdatePrompt({ installed: latest, latest: installed, dismissed: null, now }),
    ).toBe(false);
  });

  it("shows nothing without a build to compare or a release to offer", () => {
    expect(shouldShowUpdatePrompt({ installed: null, latest, dismissed: null, now })).toBe(false);
    expect(shouldShowUpdatePrompt({ installed, latest: null, dismissed: null, now })).toBe(false);
  });

  // "Later" is not remembered across launches, so a cold launch is always
  // `dismissed: null` — the reported case, where the prompt never came back.
  it("comes back on a cold launch after Later", () => {
    expect(shouldShowUpdatePrompt({ installed, latest, dismissed: null, now: now + 60_000 })).toBe(
      true,
    );
  });

  it("stays away in the same session until the check interval has passed", () => {
    expect(shouldShowUpdatePrompt({ installed, latest, dismissed: later, now: now + 60_000 })).toBe(
      false,
    );
    expect(
      shouldShowUpdatePrompt({
        installed,
        latest,
        dismissed: later,
        now: now + APP_UPDATE_CHECK_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("offers a release newer than the one put away straight away", () => {
    expect(
      shouldShowUpdatePrompt({
        installed,
        latest: { versionCode: 97, versionName: "1.0.97" },
        dismissed: later,
        now: now + 60_000,
      }),
    ).toBe(true);
  });

  it("is not silenced by a clock set backwards", () => {
    expect(shouldShowUpdatePrompt({ installed, latest, dismissed: later, now: now - 60_000 })).toBe(
      true,
    );
  });

  it("stops once the installed build is current", () => {
    expect(
      shouldShowUpdatePrompt({ installed: latest, latest, dismissed: null, now }),
    ).toBe(false);
  });
});

describe("the release waiting for this phone", () => {
  const installed = { versionCode: 95, versionName: "1.0.95" };
  const latest = { versionCode: 96, versionName: "1.0.96" };

  it("is the latest release only when it is newer", () => {
    expect(newerRelease(installed, latest)).toBe(latest);
    expect(newerRelease(latest, installed)).toBeNull();
    expect(newerRelease(latest, latest)).toBeNull();
    expect(newerRelease(null, latest)).toBeNull();
    expect(newerRelease(installed, null)).toBeNull();
  });
});

describe("confirming an update", () => {
  const installed = { versionCode: 96, versionName: "1.0.96" };

  it("is due on the first launch of a newer build", () => {
    expect(justUpdated(installed, 95)).toBe(true);
  });

  it("is not due on a fresh install, a relaunch, or a downgrade", () => {
    expect(justUpdated(installed, null)).toBe(false);
    expect(justUpdated(installed, 96)).toBe(false);
    expect(justUpdated(installed, 97)).toBe(false);
  });
});
