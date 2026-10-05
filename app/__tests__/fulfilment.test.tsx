import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import FulfilmentScreen from "@/app/request/fulfilment";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { usePlatformSettings } from "@/store/platformSettings";
import { CHECKOUT_SETTINGS, renderInSafeArea } from "@/test/checkoutFixtures";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getSettings: jest.fn(),
    listAddresses: jest.fn(),
    matchShop: jest.fn(() => new Promise(() => {})),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HOME_ADDRESS = {
  id: "addr_home", label: "Home", addressLine: "12 Quimpo Blvd, Talomo",
  point: { lat: 7.076, lng: 125.615, label: "12 Quimpo Blvd, Talomo" }, isDefault: true, version: 1,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
};

const SETTINGS = {
  ...CHECKOUT_SETTINGS,
  hubPickup: {
    point: { lat: 7.0923, lng: 125.6165, label: "GRIDGO Office" },
    feeMinor: 0,
    schedule: {
      utcOffsetMinutes: 480,
      week: [1, 3, 5].map((weekday) => ({ weekday, opensMinute: 540, closesMinute: 1020 })),
    },
  },
};

beforeEach(() => {
  mockPush.mockReset();
  api.matchShop.mockClear();
  clearMatchPrefetch();
  useJobFulfilment.getState().clear();
  api.getSettings.mockResolvedValue(SETTINGS);
  usePlatformSettings.getState().adopt(SETTINGS);
  api.listAddresses.mockResolvedValue([HOME_ADDRESS]);
});

afterEach(async () => {
  await cleanup();
});

/*
  Delivery or pick-up, asked between the date and the match (#158). One press
  per test (AGENTS.md).
*/
describe("delivery or pick-up", () => {
  it("offers both, with the pick-up fee as Free, and nothing chosen for the client", async () => {
    await renderInSafeArea(<FulfilmentScreen />);

    expect(screen.getByText("How should it reach you?")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Deliver to me/ }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByRole("radio", { name: /Pick up.*Free/ }).props.accessibilityState.checked).toBe(false);
  });

  it("shows the hub's hours from settings once pick-up is chosen", async () => {
    useJobFulfilment.getState().set({ fulfillmentMode: "pickup", dropoff: null });
    await renderInSafeArea(<FulfilmentScreen />);

    expect(screen.getByText("GRIDGO Office")).toBeTruthy();
    expect(screen.getByText("Mon, Wed, Fri · 9:00 AM – 5:00 PM")).toBeTruthy();
    expect(screen.getByLabelText("Open GRIDGO Office in Maps")).toBeTruthy();
  });

  it("says so rather than inventing hours Super Admin has not set", async () => {
    usePlatformSettings.getState().adopt({ ...SETTINGS, hubPickup: { ...SETTINGS.hubPickup, schedule: null } });
    api.getSettings.mockResolvedValue({ ...SETTINGS, hubPickup: { ...SETTINGS.hubPickup, schedule: null } });
    useJobFulfilment.getState().set({ fulfillmentMode: "pickup", dropoff: null });
    await renderInSafeArea(<FulfilmentScreen />);

    expect(screen.getByText(/Collection hours are not set yet/)).toBeTruthy();
    expect(screen.queryByText(/Mon, Wed, Fri/)).toBeNull();
  });

  it("will not go on until delivery or pick-up is chosen", async () => {
    await renderInSafeArea(<FulfilmentScreen />);

    fireEvent.press(screen.getByText("Continue"));

    expect(await screen.findByText("Choose delivery or pick-up.")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("matches a delivery against the client's own default address", async () => {
    useJobFulfilment.getState().set({ fulfillmentMode: "delivery", dropoff: HOME_ADDRESS.point });
    await renderInSafeArea(<FulfilmentScreen />);
    await screen.findByText("12 Quimpo Blvd, Talomo");

    fireEvent.press(screen.getByText("Continue"));

    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/request/rank" }));
    expect(useJobFulfilment.getState().choice).toEqual({ fulfillmentMode: "delivery", dropoff: HOME_ADDRESS.point });
    expect(api.matchShop).toHaveBeenCalledWith(
      expect.objectContaining({ subcategoryCode: "flyers", fulfillmentMode: "delivery", dropoff: HOME_ADDRESS.point }),
    );
  });
});
