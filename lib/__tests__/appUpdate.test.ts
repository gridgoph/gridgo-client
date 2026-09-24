import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  APP_UPDATE_SOURCE,
  fetchLatestRelease,
  installedBuild,
  justUpdated,
  localDay,
  parseForcedVersionCode,
  releaseBuildFromTag,
  shouldCheckForUpdate,
  shouldOfferUpdate,
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
  it("asks GitHub for this app's latest release", async () => {
    const fetchImpl = jest.fn(async () => response(200, { tag_name: "v1.0.96" }));
    await expect(fetchLatestRelease(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      versionCode: 96,
      versionName: "1.0.96",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      APP_UPDATE_SOURCE.latestReleaseUrl,
      expect.objectContaining({ headers: { Accept: "application/vnd.github+json" } }),
    );
  });

  it("answers nothing offline, rate-limited, or for a release it cannot read", async () => {
    const answers: (() => Promise<Response>)[] = [
      async () => {
        throw new TypeError("Network request failed");
      },
      async () => response(403, { message: "API rate limit exceeded" }),
      async () => response(429, {}),
      async () => response(404, { message: "Not Found" }),
      async () => response(200, null),
      async () => response(200, { tag_name: "nightly" }),
      async () => response(200, { tag_name: "v1.0.96", prerelease: true }),
      async () => ({ ok: true, status: 200, json: async () => JSON.parse("<html>") }) as Response,
    ];
    for (const answer of answers) {
      await expect(fetchLatestRelease(answer as unknown as typeof fetch)).resolves.toBeNull();
    }
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
    ).resolves.toBeNull();
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

describe("offering an update", () => {
  const installed = { versionCode: 95, versionName: "1.0.95" };
  const latest = { versionCode: 96, versionName: "1.0.96" };
  const today = "2026-09-24";

  it("offers only a newer release", () => {
    expect(shouldOfferUpdate({ installed, latest, dismissed: null, today })).toBe(true);
    expect(shouldOfferUpdate({ installed, latest: installed, dismissed: null, today })).toBe(false);
    expect(
      shouldOfferUpdate({ installed: latest, latest: installed, dismissed: null, today }),
    ).toBe(false);
  });

  it("keeps quiet about a release put off today", () => {
    expect(
      shouldOfferUpdate({ installed, latest, dismissed: { versionCode: 96, day: today }, today }),
    ).toBe(false);
  });

  it("offers the release again the next day", () => {
    expect(
      shouldOfferUpdate({
        installed,
        latest,
        dismissed: { versionCode: 96, day: "2026-09-23" },
        today,
      }),
    ).toBe(true);
  });

  it("offers a release newer than the one put off straight away", () => {
    expect(
      shouldOfferUpdate({
        installed,
        latest: { versionCode: 97, versionName: "1.0.97" },
        dismissed: { versionCode: 96, day: today },
        today,
      }),
    ).toBe(true);
  });

  it("dates a dismissal by the phone's own calendar", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
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
