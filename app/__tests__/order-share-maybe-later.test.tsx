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
it("Maybe later puts the card off, closes it, and leaves the one repeat for later", async () => {
  serve();
  await renderScreen(<OrderShareScreen />);
  await waitFor(() => expect(api.recordShareCard).toHaveBeenCalledWith(ORDER, "after_survey", "shown"));

  fireEvent.press(screen.getByRole("button", { name: "Maybe later" }));

  await waitFor(() => expect(api.recordShareCard).toHaveBeenCalledWith(ORDER, "after_survey", "maybe_later"));
  expect(mockBack).toHaveBeenCalled();
  expect(useOrderShare.getState().putOff[ORDER]).toBe(true);
  // Leaving after the answer sends nothing more.
  await cleanup();
  expect(api.recordShareCard).toHaveBeenCalledTimes(2);
  expect(api.recordShareTap).not.toHaveBeenCalled();
});
