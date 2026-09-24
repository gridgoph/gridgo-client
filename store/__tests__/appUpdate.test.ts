import { APP_UPDATE_CHECK_INTERVAL_MS } from "@/lib/appUpdate";
import { useAppUpdate } from "@/store/appUpdate";

const installed = { versionCode: 95, versionName: "1.0.95" };
const now = new Date(2026, 8, 24, 9).getTime();

function releases(...tags: string[]) {
  const fetchImpl = jest.fn();
  for (const tag of tags) {
    fetchImpl.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tag_name: tag }) });
  }
  return fetchImpl as unknown as jest.Mock & typeof fetch;
}

beforeEach(() => {
  useAppUpdate.getState().reset();
});

describe("on launch", () => {
  it("records the build without calling a fresh install an update", () => {
    useAppUpdate.getState().start(installed);
    expect(useAppUpdate.getState()).toMatchObject({ completed: null, lastSeenVersionCode: 95 });
  });

  it("confirms an update once, on the first launch of the newer build", () => {
    useAppUpdate.setState({ lastSeenVersionCode: 94 });
    useAppUpdate.getState().start(installed);
    expect(useAppUpdate.getState().completed).toEqual(installed);
    expect(useAppUpdate.getState().lastSeenVersionCode).toBe(95);

    useAppUpdate.getState().acknowledgeCompleted();
    useAppUpdate.getState().start(installed);
    expect(useAppUpdate.getState().completed).toBeNull();
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
    expect(useAppUpdate.getState().available).toEqual({ versionCode: 96, versionName: "1.0.96" });
  });

  it("offers nothing when this phone is current", async () => {
    await useAppUpdate.getState().check(now, releases("v1.0.95"));
    expect(useAppUpdate.getState().available).toBeNull();
  });

  it("says nothing when offline", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await useAppUpdate.getState().check(now, fetchImpl as unknown as typeof fetch);
    expect(useAppUpdate.getState()).toMatchObject({ available: null, checking: false });
  });

  it("reads again on return to the foreground only after the interval", async () => {
    const fetchImpl = releases("v1.0.95", "v1.0.96");
    await useAppUpdate.getState().check(now, fetchImpl);
    await useAppUpdate.getState().check(now + 60_000, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await useAppUpdate.getState().check(now + APP_UPDATE_CHECK_INTERVAL_MS, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(useAppUpdate.getState().available?.versionCode).toBe(96);
  });

  it("does not ask about a release put off today, and asks again tomorrow", async () => {
    await useAppUpdate.getState().check(now, releases("v1.0.96"));
    useAppUpdate.getState().later(now);
    expect(useAppUpdate.getState().available).toBeNull();

    const later = now + APP_UPDATE_CHECK_INTERVAL_MS;
    await useAppUpdate.getState().check(later, releases("v1.0.96"));
    expect(useAppUpdate.getState().available).toBeNull();

    const tomorrow = new Date(2026, 8, 25, 8).getTime();
    await useAppUpdate.getState().check(tomorrow, releases("v1.0.96"));
    expect(useAppUpdate.getState().available?.versionCode).toBe(96);
  });

  it("steps aside once the download is handed to the phone, without putting it off", async () => {
    await useAppUpdate.getState().check(now, releases("v1.0.96"));
    useAppUpdate.getState().startDownload();
    expect(useAppUpdate.getState()).toMatchObject({ available: null, dismissed: null });
  });
});
