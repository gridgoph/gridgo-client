import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
import { useCart } from "@/store/cart";
import {
  CHECKOUT_SETTINGS,
  HOME,
  checkoutCart,
  renderInSafeArea,
} from "@/test/checkoutFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
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
    getCart: jest.fn(),
    getCatalogShop: jest.fn(),
    listAddresses: jest.fn(),
    setCartDropoffs: jest.fn(),
    checkArtworkLink: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const OFFICE = { lat: 7.0923, lng: 125.6165, label: "GRIDGO Office" };
const HUB = {
  point: OFFICE,
  feeMinor: 0,
  schedule: {
    utcOffsetMinutes: 480,
    week: [1, 3, 5].map((weekday) => ({ weekday, opensMinute: 540, closesMinute: 1020 })),
    closures: [],
  },
};

function show(cart: Cart) {
  api.getCart.mockResolvedValue(cart);
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });
  return renderInSafeArea(<CheckoutScreen />);
}

beforeEach(() => {
  api.getSettings.mockResolvedValue(CHECKOUT_SETTINGS);
  api.listAddresses.mockResolvedValue([]);
  api.getCatalogShop.mockReset();
});

afterEach(async () => {
  await cleanup();
});

/*
  Delivery or pick-up was chosen before the match (#158): checkout reads it
  back and never asks again. Rendered from stores only; nothing presses.
*/
describe("checkout reads back the choice made before matching", () => {
  it("shows a pick-up at GRIDGO Office with its hours, and Free for a zero fee", async () => {
    await show(
      checkoutCart(
        {
          fulfillmentMode: "pickup",
          defaultDropoff: null,
          requestFulfillment: { fulfillmentMode: "pickup", dropoff: OFFICE },
          hubPickup: HUB,
        },
        { pickupFeeMinor: 0, downpaymentPercent: 100 },
      ),
    );
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("GRIDGO Office")).toBeTruthy();
    expect(screen.getByText("Mon, Wed, Fri · 9:00 AM – 5:00 PM")).toBeTruthy();
    expect(screen.getByText(/You chose pick-up before GRIDGO matched your printer/)).toBeTruthy();
    expect(screen.getByText("Pick-up")).toBeTruthy();
    expect(screen.getByText("Free")).toBeTruthy();
    // ₱44 printing + ₱0 pick-up, never a ₱0.00 row.
    expect(screen.queryByText("₱0.00")).toBeNull();
    expect(screen.getAllByText("₱44.00").length).toBeGreaterThan(0);
    // Read-only: no Delivery / Pickup / Multi-drop control to change it.
    expect(screen.queryByRole("radio", { name: "Multi-drop" })).toBeNull();
  });

  it("says when the hub has no hours set, rather than inventing them", async () => {
    await show(
      checkoutCart(
        {
          fulfillmentMode: "pickup",
          defaultDropoff: null,
          requestFulfillment: { fulfillmentMode: "pickup", dropoff: OFFICE },
          hubPickup: { ...HUB, schedule: null, feeMinor: 5000 },
        },
        { pickupFeeMinor: 5000, downpaymentPercent: 100 },
      ),
    );
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText(/Collection hours are not set yet/)).toBeTruthy();
    // A configured fee is a real row, inside the total once.
    expect(screen.getByText("₱50.00")).toBeTruthy();
    expect(screen.getAllByText("₱94.00").length).toBeGreaterThan(0);
  });

  it("shows a delivery to the address it was matched for, with GRIDGO's zone", async () => {
    await show(
      checkoutCart(
        { requestFulfillment: { fulfillmentMode: "delivery", dropoff: HOME } },
        { legs: [{ feeMinor: 2500, zone: { key: "nearby", label: "Nearby" } }], downpaymentPercent: 100 },
      ),
    );
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("12 Quimpo Blvd, Talomo")).toBeTruthy();
    expect(screen.getByText(/You chose delivery before GRIDGO matched your printer/)).toBeTruthy();
    expect(screen.getByText("₱25.00 · Nearby")).toBeTruthy();
    expect(screen.queryByLabelText("Change the delivery address")).toBeNull();
    // The quote did the measuring: no shop board is read for its pin.
    expect(api.getCatalogShop).not.toHaveBeenCalled();
  });

  it("keeps the old choice on a basket from before the step", async () => {
    await show(checkoutCart({ requestFulfillment: null }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByRole("radio", { name: "Multi-drop" })).toBeTruthy();
    expect(screen.getByLabelText("Change the delivery address")).toBeTruthy();
  });
});

it.each([false, true])("legacy checkout offers pickup only when enabled=%s", async (enabled) => {
  api.getSettings.mockResolvedValue({ ...CHECKOUT_SETTINGS, hubPickupEnabled: enabled });
  await show(checkoutCart({ requestFulfillment: null }));
  await screen.findByText("WHAT GRIDGO IS PRINTING");
  if (enabled) expect(await screen.findByRole("radio", { name: "Pickup" })).toBeTruthy();
  else expect(screen.queryByRole("radio", { name: "Pickup" })).toBeNull();
  expect(screen.getByRole("radio", { name: "Delivery" })).toBeTruthy();
});

it("explains a locked pickup draft while preserving its selected hub", async () => {
  api.getSettings.mockResolvedValue({ ...CHECKOUT_SETTINGS, hubPickupEnabled: false });
  await show(checkoutCart({ fulfillmentMode: "pickup", requestFulfillment: { fulfillmentMode: "pickup", dropoff: OFFICE }, hubPickup: HUB }));
  expect(await screen.findByText(/Start a new print job and choose delivery/)).toBeTruthy();
  expect(screen.getByText("GRIDGO Office")).toBeTruthy();
  expect(useCart.getState().cart?.fulfillmentMode).toBe("pickup");
  await fireEvent.press(screen.getByLabelText("Place this order"));
  expect(await screen.findByText(/Choose delivery, or start a new print job to change a locked pick-up choice/)).toBeTruthy();
});
