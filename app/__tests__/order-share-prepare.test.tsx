import { act, cleanup, screen } from "@testing-library/react-native";

import OrderShareScreen from "@/app/order/share";
import type { OrderShareRead } from "@/lib/api";
import { useOrderShare } from "@/store/orderShare";
import { useSession } from "@/store/session";
import { renderScreen } from "@/test/renderScreen";
import { orderShare, shareRead } from "@/test/shareFixtures";

const mockParams: { orderId: string; presentation?: string } = { orderId: "ord_refund_1", presentation: "manual" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/shareScreenMocks").shareApiMock());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/shareStory", () => require("@/test/shareScreenMocks").shareStoryMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ORDER = "ord_refund_1";
/** What `GET /orders/:id/share` may answer before the invite exists. */
const UNPREPARED = orderShare({ inviteCode: null, inviteLink: null }, { showAfterSurvey: false });

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: { id: "u1", email: "c@gridgo.local", name: "Ana Cruz", role: "client" } });
  useOrderShare.getState().reset();
  // The order screen's GET already landed: available, but no invite yet.
  useOrderShare.setState({ shares: { [ORDER]: UNPREPARED }, status: { [ORDER]: "ready" } });
});

/* No presses in this file. */
it("waits for prepare before drawing the story or offering Share, then shares the prepared invite", async () => {
  let answer: (read: OrderShareRead) => void = () => undefined;
  api.prepareOrderShare.mockReturnValue(new Promise<OrderShareRead>((resolve) => (answer = resolve)));
  await renderScreen(<OrderShareScreen />);

  expect(screen.getByLabelText("Getting your share card ready")).toBeTruthy();
  expect(screen.queryByLabelText(/^Story picture/)).toBeNull();
  expect(screen.getByRole("button", { name: "Share" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();

  await act(async () => answer(shareRead(orderShare({ inviteLink: null }, { showAfterSurvey: false }))));

  expect(await screen.findByLabelText(/With your invite code, 0123 4567 89AB CDEF 0123 4567\./)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Share" }).props.accessibilityState.disabled).toBe(false);
});

it("does not share a cached answer when prepare fails", async () => {
  api.prepareOrderShare.mockRejectedValue(new TypeError("Network request failed"));
  await renderScreen(<OrderShareScreen />);

  expect(await screen.findByText("GRIDGO could not get your share card ready. Check your connection and try again.")).toBeTruthy();
  expect(screen.queryByLabelText(/^Story picture/)).toBeNull();
  expect(screen.getByRole("button", { name: "Share" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});
