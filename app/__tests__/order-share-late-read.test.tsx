import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderShareScreen from "@/app/order/share";
import type { OrderShareRead } from "@/lib/api";
import { useOrderShare } from "@/store/orderShare";
import { useSession } from "@/store/session";
import { renderScreen } from "@/test/renderScreen";
import { SHARE_LINK, orderShare, shareRead } from "@/test/shareFixtures";

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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const story = require("@/lib/shareStory");

const ORDER = "ord_refund_1";
/** What `GET /orders/:id/share` answers before the invite exists. */
const UNPREPARED = orderShare({ inviteCode: null, inviteLink: null }, { showAfterSurvey: false });
const PREPARED = orderShare({}, { showAfterSurvey: false });

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: { id: "u1", email: "c@gridgo.local", name: "Ana Cruz", role: "client" } });
  useOrderShare.getState().reset();
  useOrderShare.setState({ pendingTaps: [], pendingCards: [], shares: { [ORDER]: UNPREPARED }, status: { [ORDER]: "ready" } });
  api.recordShareTap.mockImplementation(async (_order: string, eventId: string) => ({
    ...shareRead(PREPARED),
    eventId,
    recorded: true,
    replay: false,
  }));
});

/* The one press in this file. */
it("an older read landing after prepare does not take the invite off the card", async () => {
  // The order screen's GET is still on the wire when Share is opened.
  let olderRead: (read: OrderShareRead) => void = () => undefined;
  api.getOrderShare.mockReturnValue(new Promise<OrderShareRead>((resolve) => (olderRead = resolve)));
  const older = useOrderShare.getState().load(ORDER);
  let prepared: (read: OrderShareRead) => void = () => undefined;
  api.prepareOrderShare.mockReturnValue(new Promise<OrderShareRead>((resolve) => (prepared = resolve)));
  await renderScreen(<OrderShareScreen />);

  await act(async () => prepared(shareRead(PREPARED)));
  expect(await screen.findByLabelText(/With a QR code for your invite link\./)).toBeTruthy();
  await act(async () => {
    olderRead(shareRead(UNPREPARED));
    await older;
  });

  // The card still carries the invite, and so does the cache.
  expect(screen.getByLabelText(/With a QR code for your invite link\./)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send to a friend" })).toBeTruthy();
  expect(useOrderShare.getState().shares[ORDER].inviteCode).toBe(PREPARED.inviteCode);

  fireEvent.press(screen.getByRole("button", { name: "Share" }));

  await waitFor(() => expect(story.shareStory).toHaveBeenCalled());
  expect(story.shareStory).toHaveBeenCalledWith(
    expect.objectContaining({ link: SHARE_LINK, text: expect.stringContaining(SHARE_LINK) }),
  );
});
