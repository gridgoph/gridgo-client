import { screen, waitFor } from "@testing-library/react-native";

import GroupCheckoutScreen from "@/app/express/group/checkout";
import * as api from "@/lib/api";
import { useExpressGroup } from "@/store/expressGroup";
import { useGroupCheckout } from "@/store/groupCheckout";
import { useSession } from "@/store/session";
import { groupFixture } from "@/test/expressGroup";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
  return { Stack: { Screen: () => null }, useLocalSearchParams: () => ({ id: "grp_1" }), useRouter: () => router };
});
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  prepareExpressGroup: jest.fn(),
  getSettings: jest.fn(async () => ({})),
}));

// gridgo-client#452: the host pays GRIDGO once; delivery is one fare, said once.
it("quotes the whole group with one delivery fee and one pay button", async () => {
  const group = groupFixture({ state: "checkout_open", payBy: new Date(Date.now() + 9 * 60_000).toISOString() });
  useExpressGroup.getState().reset();
  useGroupCheckout.getState().reset();
  useSession.setState({ user: { id: "u_host", name: "Ana Cruz" } as never });
  useExpressGroup.setState({ byId: { grp_1: group } });
  jest.mocked(api.prepareExpressGroup).mockResolvedValue({
    group,
    cartId: "cart_1",
    confirmation: "conf",
    quote: { clientItemSubtotalMinor: 2610, deliveryFeeMinor: 2500, totalMinor: 5110 },
    shop: { supplierId: "s_1", name: "Test Shop", distanceMeters: 2600, location: { lat: 7.08, lng: 125.61, label: "Poblacion" } },
  } as never);
  await renderScreen(<GroupCheckoutScreen />);
  await waitFor(() => expect(api.prepareExpressGroup).toHaveBeenCalledWith("grp_1", null));
  expect(await screen.findByText("Delivery, once")).toBeTruthy();
  expect(screen.getByText("₱25.00")).toBeTruthy();
  expect(screen.getByText("Pay for the group · ₱51.10")).toBeTruthy();
  expect(screen.getByText("You pay GRIDGO once for everyone.")).toBeTruthy();
  expect(screen.getByText("2 people · 6 pages")).toBeTruthy();
  expect(screen.getByText(/GRIDGO only collects from you, Ana/)).toBeTruthy();
});
