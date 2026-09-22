import { ApiError, type PlatformSettings } from "@/lib/api";
import { usePlatformSettings } from "@/store/platformSettings";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getSettings: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SETTINGS: PlatformSettings = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

beforeEach(() => {
  usePlatformSettings.getState().reset();
  api.getSettings.mockReset();
});

describe("GRIDGO's charges, read once and shared", () => {
  it("has no rate until GRIDGO has answered, so no shop figure is ever drawn raw", () => {
    expect(usePlatformSettings.getState().serviceFeeRateBps()).toBeNull();
  });

  it("reads the rate from GET /settings and shares one read between callers", async () => {
    api.getSettings.mockResolvedValue(SETTINGS);

    await Promise.all([
      usePlatformSettings.getState().load(),
      usePlatformSettings.getState().load(),
    ]);

    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(usePlatformSettings.getState().serviceFeeRateBps()).toBe(1000);
  });

  it("keeps the rate a screen already fetched, without a second read", () => {
    usePlatformSettings.getState().adopt({ ...SETTINGS, serviceFeeRateBps: 1250 });

    expect(usePlatformSettings.getState().serviceFeeRateBps()).toBe(1250);
    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it("keeps the last known rate when a refresh fails", async () => {
    usePlatformSettings.getState().adopt(SETTINGS);
    api.getSettings.mockRejectedValue(new ApiError(503, { error: "unavailable" }));

    await expect(usePlatformSettings.getState().load({ refresh: true })).rejects.toBeInstanceOf(ApiError);

    expect(usePlatformSettings.getState().serviceFeeRateBps()).toBe(1000);
  });

  it("does not re-read a rate it already holds unless asked to refresh", async () => {
    usePlatformSettings.getState().adopt(SETTINGS);
    api.getSettings.mockResolvedValue({ ...SETTINGS, serviceFeeRateBps: 900 });

    await usePlatformSettings.getState().load();
    expect(api.getSettings).not.toHaveBeenCalled();

    await usePlatformSettings.getState().load({ refresh: true });
    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(usePlatformSettings.getState().serviceFeeRateBps()).toBe(900);
  });
});
