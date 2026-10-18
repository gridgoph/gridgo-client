import { act, cleanup, screen, waitFor } from "@testing-library/react-native";

import FulfilmentScreen from "@/app/request/fulfilment";
import { useAddressDeletion } from "@/store/addressDeletion";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { usePlatformSettings } from "@/store/platformSettings";
import { CHECKOUT_SETTINGS, renderInSafeArea } from "@/test/checkoutFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getSettings: jest.fn(), listAddresses: jest.fn(), deleteAddress: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const HOME = {
  id: "addr_home", label: "Home", addressLine: "12 Quimpo Blvd, Talomo",
  point: { lat: 7.076, lng: 125.615, label: "12 Quimpo Blvd, Talomo" }, isDefault: true, version: 1,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
};
const WORK = { ...HOME, id: "addr_work", label: "Work", isDefault: false, point: { lat: 7.07, lng: 125.6, label: "Bajada" } };

afterEach(async () => {
  await cleanup();
});

it("drops a deleted address from the choice and stops preselecting it", async () => {
  api.getSettings.mockResolvedValue(CHECKOUT_SETTINGS);
  usePlatformSettings.getState().adopt(CHECKOUT_SETTINGS);
  api.listAddresses.mockResolvedValueOnce([HOME, WORK]).mockResolvedValue([WORK]);
  api.deleteAddress.mockResolvedValue({ defaultCleared: true });
  useJobFulfilment.getState().set({ fulfillmentMode: "delivery", dropoff: { ...HOME.point } });

  await renderInSafeArea(<FulfilmentScreen />);
  expect(await screen.findByLabelText("Delete Home")).toBeTruthy();
  expect(screen.getByRole("radio", { name: /Deliver to Home/ }).props.accessibilityState.checked).toBe(true);

  useAddressDeletion.getState().ask("fulfilment", HOME, [HOME, WORK]);
  await act(async () => {
    await useAddressDeletion.getState().confirm();
  });

  expect(
    await screen.findByText(
      "Home deleted. No default address is set now, so GRIDGO will ask where to deliver on your next order.",
    ),
  ).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("radio", { name: /Deliver to Home/ })).toBeNull());
  // Not redrawn as a stray "New address" either.
  expect(screen.queryByText("New address")).toBeNull();
  expect(screen.getByRole("radio", { name: /Deliver to Work/ }).props.accessibilityState.checked).toBe(true);
});
