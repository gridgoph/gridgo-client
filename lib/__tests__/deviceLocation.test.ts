import { LOCATION_DENIED, peekCurrentLocation, requestCurrentLocation } from "@/lib/deviceLocation";
import * as nativeModules from "@/lib/nativeModules";

const Location = {
  Accuracy: { Balanced: 3, Low: 1 },
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
