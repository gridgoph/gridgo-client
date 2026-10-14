import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import VouchersScreen from "@/app/vouchers";
import { useCart } from "@/store/cart";
import { useVouchers } from "@/store/vouchers";
import { checkoutCart } from "@/test/checkoutFixtures";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { HOUR, voucher } from "@/test/voucherFixtures";

// The other half of gridgoph/gridgo-client#250: a basket with lines still opens checkout.

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listVouchers: jest.fn(), getCart: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  mockPush.mockClear();
  useVouchers.getState().reset();
  const basket = checkoutCart();
  useCart.setState({ cartId: basket.id, cart: null, hydrated: true });
  api.getCart.mockResolvedValue(basket);
  api.listVouchers.mockResolvedValue({
    serverTime: new Date().toISOString(),
    vouchers: [voucher({ id: "calm", name: "Soft-launch tester thanks", expiresAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString() })],
  });
});

it('a basket with something in it is where the voucher comes off', async () => {
  await renderInSafeArea(<VouchersScreen />);
  await waitFor(() => expect(useCart.getState().cart).not.toBeNull());
  await fireEvent.press(await screen.findByLabelText("Use Soft-launch tester thanks now"));
  expect(mockPush).toHaveBeenCalledWith("/checkout");
});
