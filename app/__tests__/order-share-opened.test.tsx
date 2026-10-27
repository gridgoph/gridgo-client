import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderShareScreen from "@/app/order/share";
import { useOrderShare } from "@/store/orderShare";
import { useSession } from "@/store/session";
import { renderScreen } from "@/test/renderScreen";
import { orderShare, shareRead } from "@/test/shareFixtures";

const mockBack = jest.fn();
const mockParams: { orderId: string; presentation?: string } = { orderId: "ord_refund_1", presentation: "after_survey" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/shareScreenMocks").shareApiMock());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/shareStory", () => require("@/test/shareScreenMocks").shareStoryMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharing = require("@/lib/shareStory");

const ORDER = "ord_refund_1";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function serve(share = orderShare()) {
  api.prepareOrderShare.mockResolvedValue(shareRead(share));
  api.recordShareCard.mockResolvedValue(shareRead(share));
  api.recordShareTap.mockImplementation(async (_order: string, eventId: string) => ({
    ...shareRead(share),
    eventId,
    recorded: true,
    replay: false,
  }));
  useOrderShare.setState({ shares: { [ORDER]: share }, status: { [ORDER]: "ready" } });
}

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: { id: "u1", email: "c@gridgo.local", name: "Ana Cruz", role: "client" } });
  useOrderShare.getState().reset();
  useOrderShare.setState({ pendingTaps: [] });
});

/* One press per file (AGENTS.md, "Running and testing"). */
it("an Android chooser that only opened does not close the card for good", async () => {
  serve();
  // expo-sharing answers the same for a post and for Back.
  sharing.shareStory.mockResolvedValueOnce({ kind: "opened", linkCopied: true });
  await renderScreen(<OrderShareScreen />);
  await waitFor(() => expect(api.recordShareCard).toHaveBeenCalledWith(ORDER, "after_survey", "shown"));

  fireEvent.press(await screen.findByRole("button", { name: "Share" }));

  expect(await screen.findByText("Invite link copied. Paste it into your post.")).toBeTruthy();
  // Still Maybe later, so the one repeat is not spent on a guess.
  expect(screen.getByRole("button", { name: "Maybe later" })).toBeTruthy();
  expect(api.recordShareCard).not.toHaveBeenCalledWith(ORDER, "after_survey", "close");
  expect(api.recordShareTap).toHaveBeenCalledWith(ORDER, expect.stringMatching(UUID_V4), "share");
});
