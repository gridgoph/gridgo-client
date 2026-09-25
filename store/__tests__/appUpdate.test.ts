import { APP_UPDATE_CHECK_INTERVAL_MS } from "@/lib/appUpdate";
import { selectAvailableUpdate, useAppUpdate } from "@/store/appUpdate";

const installed = { versionCode: 95, versionName: "1.0.95" };
const now = new Date(2026, 8, 24, 9).getTime();

function releases(...tags: string[]) {
  const fetchImpl = jest.fn();
  for (const tag of tags) {
    fetchImpl.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tag_name: tag }) });
  }
  return fetchImpl as unknown as jest.Mock & typeof fetch;
}

const available = () => selectAvailableUpdate(useAppUpdate.getState());
const promptOpen = () => useAppUpdate.getState().promptOpen;

/** What a force-stop keeps: only the persisted fields survive into the next launch. */
function coldLaunch() {
  const { lastSeenVersionCode, latest, updatedNotice } = useAppUpdate.getState();
  useAppUpdate.getState().reset();
  useAppUpdate.setState({ lastSeenVersionCode, latest, updatedNotice });
}

beforeEach(() => {
  useAppUpdate.getState().reset();
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("on launch", () => {
  it("records the build without calling a fresh install an update", () => {
    useAppUpdate.getState().start(installed);
    expect(useAppUpdate.getState()).toMatchObject({ completed: null, lastSeenVersionCode: 95 });
  });

  it("confirms an update once, on the first launch of the newer build", () => {
    useAppUpdate.setState({ lastSeenVersionCode: 94 });
    useAppUpdate.getState().start(installed, now);
    expect(useAppUpdate.getState().completed).toEqual(installed);
    expect(useAppUpdate.getState().lastSeenVersionCode).toBe(95);
    expect(useAppUpdate.getState().updatedNotice).toEqual({ build: installed, at: now });

    useAppUpdate.getState().acknowledgeCompleted();
    coldLaunch();
    useAppUpdate.getState().start(installed, now + 60_000);
    expect(useAppUpdate.getState().completed).toBeNull();
    // The Notifications item is the one written on the first launch, not a new one.
    expect(useAppUpdate.getState().updatedNotice).toEqual({ build: installed, at: now });

    useAppUpdate.getState().dismissUpdatedNotice();
    coldLaunch();
    useAppUpdate.getState().start(installed);
    expect(useAppUpdate.getState().updatedNotice).toBeNull();
  });

  it("writes no Updated item on a fresh install", () => {
    useAppUpdate.getState().start(installed);
    expect(useAppUpdate.getState().updatedNotice).toBeNull();
  });

  it("does not lower the last build seen after a downgrade", () => {
    useAppUpdate.setState({ lastSeenVersionCode: 97 });
    useAppUpdate.getState().start(installed);
    expect(useAppUpdate.getState()).toMatchObject({ completed: null, lastSeenVersionCode: 97 });
  });

  it("does not look for a release where there is no real build", async () => {
    const fetchImpl = releases("v1.0.96");
    useAppUpdate.getState().start(null);
    await useAppUpdate.getState().check(now, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("looking for a newer release", () => {
  beforeEach(() => {
    useAppUpdate.getState().start(installed);
  });

  it("offers a newer release", async () => {
    await useAppUpdate.getState().check(now, releases("v1.0.96"));
    expect(available()).toEqual({ versionCode: 96, versionName: "1.0.96" });
    expect(promptOpen()).toBe(true);
  });

  it("offers nothing when this phone is current", async () => {
    await useAppUpdate.getState().check(now, releases("v1.0.95"));
    expect(available()).toBeNull();
    expect(promptOpen()).toBe(false);
  });

  it("says nothing when offline", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await useAppUpdate.getState().check(now, fetchImpl as unknown as typeof fetch);
    expect(useAppUpdate.getState()).toMatchObject({ latest: null, promptOpen: false, checking: false });
  });

  it("tries again at the next foreground after a read nobody answered", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tag_name: "v1.0.96" }) });
    await useAppUpdate.getState().check(now, fetchImpl as unknown as typeof fetch);
    await useAppUpdate.getState().resume(now + 60_000, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(available()?.versionCode).toBe(96);
  });

  it("logs each decision in a development build", async () => {
    await useAppUpdate.getState().check(now, releases("v1.0.96"));
    expect(console.info).toHaveBeenCalledWith("[update-check] latest release is 1.0.96");
    expect(console.info).toHaveBeenCalledWith("[update-check] offering 1.0.96 over 1.0.95");
  });

  it("reads again on return to the foreground only after the interval", async () => {
    const fetchImpl = releases("v1.0.95", "v1.0.96");
    await useAppUpdate.getState().check(now, fetchImpl);
    await useAppUpdate.getState().resume(now + 60_000, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await useAppUpdate.getState().resume(now + APP_UPDATE_CHECK_INTERVAL_MS, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(available()?.versionCode).toBe(96);
  });
});

describe("Later", () => {
  beforeEach(async () => {
    useAppUpdate.getState().start(installed, now);
    await useAppUpdate.getState().check(now, releases("v1.0.96"));
    useAppUpdate.getState().later(now);
  });

  it("puts the prompt away but keeps the release for the Notifications card", () => {
    expect(promptOpen()).toBe(false);
    expect(available()?.versionCode).toBe(96);
  });

  // Issue #105: the prompt showed once, and after a force-stop never came back.
  it("lasts only until the next launch", async () => {
    coldLaunch();
    useAppUpdate.getState().start(installed, now + 60_000);
    // Known from the last launch, so it is back before GitHub answers.
    expect(promptOpen()).toBe(true);
    await useAppUpdate.getState().check(now + 60_000, releases("v1.0.96"));
    expect(promptOpen()).toBe(true);
  });

  it("comes back on a cold launch even when GitHub cannot be reached", async () => {
    coldLaunch();
    useAppUpdate.getState().start(installed, now + 60_000);
    const offline = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await useAppUpdate.getState().check(now + 60_000, offline as unknown as typeof fetch);
    expect(promptOpen()).toBe(true);
  });

  it("comes back on return to the foreground once the interval has passed", async () => {
    await useAppUpdate.getState().resume(now + 60_000, releases("v1.0.96"));
    expect(promptOpen()).toBe(false);

    const offline = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await useAppUpdate
      .getState()
      .resume(now + APP_UPDATE_CHECK_INTERVAL_MS, offline as unknown as typeof fetch);
    expect(promptOpen()).toBe(true);
  });

  it("stops once the installed build is current", async () => {
    coldLaunch();
    const updated = { versionCode: 96, versionName: "1.0.96" };
    useAppUpdate.getState().start(updated, now + 60_000);
    expect(promptOpen()).toBe(false);
    expect(available()).toBeNull();
    expect(useAppUpdate.getState().completed).toEqual(updated);
  });
});

describe("Update now", () => {
  it("steps aside once the download is handed to the phone, until the next launch", async () => {
    useAppUpdate.getState().start(installed, now);
    await useAppUpdate.getState().check(now, releases("v1.0.96"));
    useAppUpdate.getState().startDownload(now);
    expect(promptOpen()).toBe(false);
    expect(available()?.versionCode).toBe(96);

    // Android's installer was cancelled: the phone is still behind.
    coldLaunch();
    useAppUpdate.getState().start(installed, now + 60_000);
    expect(promptOpen()).toBe(true);
  });
});
