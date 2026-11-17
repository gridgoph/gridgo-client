import {
  LOCATION_DENIED,
  LOCATION_UNAVAILABLE,
  FALLBACK_FIX_TIMEOUT_MS,
  PRECISE_FIX_TIMEOUT_MS,
  peekCurrentLocation,
  requestCurrentLocation,
} from "@/lib/deviceLocation";
import * as nativeModules from "@/lib/nativeModules";

const Location = {
  Accuracy: { Balanced: 3, Low: 1, High: 4, Highest: 5 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
};

jest.spyOn(nativeModules, "getLocationNative").mockReturnValue(Location as never);

beforeEach(() => {
  Location.getForegroundPermissionsAsync.mockReset();
  Location.requestForegroundPermissionsAsync.mockReset();
  Location.getCurrentPositionAsync.mockReset();
});

describe("requestCurrentLocation", () => {
  it("does not invent a pin when permission is denied", async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false, status: "denied" });
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "denied",
      message: LOCATION_DENIED,
    });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("returns the phone's point when granted", async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 7.073, longitude: 125.613 },
    });
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "ok",
      point: { lat: 7.073, lng: 125.613 },
    });
  });
});

describe("precision", () => {
  it.each(["request", "peek"])("ends a %s read when neither provider answers", async (kind) => {
    jest.useFakeTimers();
    try {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
      Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
      Location.getCurrentPositionAsync.mockImplementation(() => new Promise(() => undefined));
      const answer = jest.fn();
      const pending = (kind === "request" ? requestCurrentLocation() : peekCurrentLocation()).then(answer);
      await jest.advanceTimersByTimeAsync(PRECISE_FIX_TIMEOUT_MS);
      expect(Location.getCurrentPositionAsync).toHaveBeenLastCalledWith({ accuracy: 3 });
      expect(answer).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(FALLBACK_FIX_TIMEOUT_MS);
      expect(answer).toHaveBeenCalledWith({ status: "unavailable", message: LOCATION_UNAVAILABLE });
      await pending;
    } finally {
      jest.useRealTimers();
    }
  });

  it("asks for a satellite fix and reports the phone's error radius", async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 7.073, longitude: 125.613, accuracy: 8.6 },
    });
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "ok",
      point: { lat: 7.073, lng: 125.613 },
      accuracyMeters: 9,
    });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 5 });
  });

  it("falls back to the network fix when the satellite one never comes", async () => {
    jest.useFakeTimers();
    try {
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
      Location.getCurrentPositionAsync
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce({ coords: { latitude: 7.07, longitude: 125.61, accuracy: 150 } });
      const pending = requestCurrentLocation();
      await jest.advanceTimersByTimeAsync(PRECISE_FIX_TIMEOUT_MS + 10);
      await expect(pending).resolves.toEqual({
        status: "ok",
        point: { lat: 7.07, lng: 125.61 },
        accuracyMeters: 150,
      });
      expect(Location.getCurrentPositionAsync).toHaveBeenLastCalledWith({ accuracy: 3 });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("peekCurrentLocation", () => {
  it("does not prompt when permission has not been granted", async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false, status: "undetermined" });
    await expect(peekCurrentLocation()).resolves.toBeNull();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("reads the position when permission is already granted", async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true, status: "granted" });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 7.07, longitude: 125.61 },
    });
    await expect(peekCurrentLocation()).resolves.toEqual({
      status: "ok",
      point: { lat: 7.07, lng: 125.61 },
    });
  });
});

describe("on the web build", () => {
  const { Platform } = jest.requireActual("react-native") as typeof import("react-native");
  const realOS = Platform.OS;
  const nav = globalThis.navigator as unknown as { geolocation?: unknown };
  const realGeo = nav.geolocation;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
    Object.defineProperty(nav, "geolocation", { value: realGeo, configurable: true });
  });

  it("asks the browser instead of saying the app needs a rebuild", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const getCurrentPosition = jest.fn((ok: (p: unknown) => void, _fail: unknown, _options: unknown) =>
      ok({ coords: { latitude: 7.0844, longitude: 125.6147, accuracy: 85 } }),
    );
    Object.defineProperty(nav, "geolocation", { value: { getCurrentPosition }, configurable: true });
    await expect(requestCurrentLocation()).resolves.toEqual({
      status: "ok",
      point: { lat: 7.0844, lng: 125.6147 },
      accuracyMeters: 85,
    });
    expect(getCurrentPosition.mock.calls[0][2]).toEqual(expect.objectContaining({ enableHighAccuracy: true }));
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("says location is off when the browser is refused", async () => {
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const getCurrentPosition = jest.fn((_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }));
    Object.defineProperty(nav, "geolocation", { value: { getCurrentPosition }, configurable: true });
    await expect(requestCurrentLocation()).resolves.toEqual({ status: "denied", message: LOCATION_DENIED });
  });
});
