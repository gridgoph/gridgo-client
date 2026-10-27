import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import OrderShareScreen from "@/app/order/share";
import { useOrderShare } from "@/store/orderShare";
import { useSession } from "@/store/session";
import { renderScreen } from "@/test/renderScreen";
import { orderShare, shareRead } from "@/test/shareFixtures";

const mockBack = jest.fn();
const mockParams: { orderId: string; presentation?: string } = { orderId: "ord_refund_1", presentation: "manual" };
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
it("a share sheet that fails says so, copies the link, and records nothing about the card", async () => {
  serve();
  sharing.shareStory.mockResolvedValueOnce({ kind: "failed", linkCopied: true });
  await renderScreen(<OrderShareScreen />);

  fireEvent.press(screen.getByRole("button", { name: "Share" }));

  expect(await screen.findByText("Sharing did not open on this phone. Your invite link is copied instead.")).toBeTruthy();
  expect(api.recordShareCard).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});
