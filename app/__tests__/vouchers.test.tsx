import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import VouchersScreen from "@/app/vouchers";
import { ApiError } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { HOUR, voucher } from "@/test/voucherFixtures";

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
  return { ...actual, listVouchers: jest.fn(), addVoucherCode: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const from = (ms: number) => new Date(Date.now() + ms).toISOString();

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  mockPush.mockClear();
  useVouchers.getState().reset();
  useCart.setState({ cartId: null, cart: null, hydrated: true });
  api.listVouchers.mockResolvedValue({
    serverTime: new Date().toISOString(),
    vouchers: [
      voucher({ id: "calm", name: "Soft-launch tester thanks", expiresAt: from(5 * 24 * HOUR) }),
      voucher({ id: "soon", name: "Weekend bonus", expiresAt: from(30 * HOUR) }),
      voucher({ id: "urgent", name: "Last-call bonus", expiresAt: from(9 * HOUR) }),
      voucher({ id: "used", name: "Early tester thanks", status: "used" }),
      voucher({ id: "void", name: "Pilot thanks", status: "void" }),
    ],
  });
});

/* One press per file, and it goes last (AGENTS.md, "Running and testing"). */
describe("the voucher wallet", () => {
  it("lists what can be used, soonest first, with the countdown in words and the exact expiry", async () => {
    await renderInSafeArea(<VouchersScreen />);
    await screen.findByText("Last-call bonus");

    expect(screen.getByLabelText("Available, 3")).toBeTruthy();
    expect(screen.getByLabelText("Used, 1")).toBeTruthy();
    expect(screen.getByLabelText("Expired, 1")).toBeTruthy();
    // Red under a day, amber under two, plain beyond — always with the words.
    expect(screen.getByText(/^8 h \d+ min left$/)).toBeTruthy();
    expect(screen.getByText(/^1 day (5|6) h left$/)).toBeTruthy();
    expect(screen.getByText(/^(4|5) days left$/)).toBeTruthy();
    expect(screen.getAllByText(/^Expires \w{3}, \d{1,2} \w{3}, \d{1,2}:\d{2} [AP]M$/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Use .* now$/)).toHaveLength(3);
    expect(screen.queryByText("Early tester thanks")).toBeNull();
    expect(screen.getByText(/cannot be swapped for cash or given to someone else/)).toBeTruthy();
  });

  it("says the lock in plain words and when it opens again", async () => {
    const retryAt = from(15 * 60_000);
    api.addVoucherCode.mockRejectedValue(new ApiError(429, { error: "voucher_code_locked", retryAt }));
    await renderInSafeArea(<VouchersScreen />);
    await screen.findByText("Last-call bonus");

    fireEvent.changeText(screen.getByLabelText("Voucher code"), "wrong-code");
    await waitFor(() => expect(screen.getByLabelText("Voucher code").props.value).toBe("wrong-code"));
    await fireEvent.press(screen.getByLabelText("Add code"));

    expect(await screen.findByText(/^Too many codes that did not work\. You can try again at/)).toBeTruthy();
    expect(api.addVoucherCode).toHaveBeenCalledWith("WRONG-CODE");
    expect(useVouchers.getState().lockedUntil).toBe(retryAt);
  });
});
