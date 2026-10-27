import { cleanup, screen, waitFor } from "@testing-library/react-native";

import OrderShareScreen from "@/app/order/share";
import { useOrderShare } from "@/store/orderShare";
import { useSession } from "@/store/session";
import { renderScreen } from "@/test/renderScreen";
import { orderShare, shareRead } from "@/test/shareFixtures";

const mockParams: { orderId: string; presentation?: string } = { orderId: "ord_refund_1" };
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
const sharing = require("@/lib/shareStory");

const ORDER = "ord_refund_1";

function serve(share = orderShare()) {
  api.prepareOrderShare.mockResolvedValue(shareRead(share));
  api.recordShareCard.mockResolvedValue(shareRead(share));
  useOrderShare.setState({ shares: { [ORDER]: share }, status: { [ORDER]: "ready" } });
}

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: { id: "u1", email: "c@gridgo.local", name: "Ana Cruz", role: "client" } });
  useOrderShare.getState().reset();
  mockParams.presentation = "after_survey";
});

/* No presses in this file: each interaction has its own (AGENTS.md, "Running and testing"). */
describe("the share card", () => {
  it("shows the story with Share, Send to a friend and Maybe later, and records that it was shown", async () => {
    serve(orderShare({ foundingTester: true }));
    await renderScreen(<OrderShareScreen />);

    expect(screen.getByText("Share your GRIDGO moment")).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Story picture: Delivered by GRIDGO. Printed for Ana. Founding Tester. With a QR code for your invite link.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send to a friend" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maybe later" })).toBeTruthy();
    // Always closable.
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    await waitFor(() => expect(api.recordShareCard).toHaveBeenCalledWith(ORDER, "after_survey", "shown"));
    expect(api.prepareOrderShare).toHaveBeenCalledWith(ORDER);
    expect(useOrderShare.getState().presenting).toEqual({ orderId: ORDER, presentation: "after_survey" });
  });

  it("leaves Founding Tester off when the label was not awarded", async () => {
    serve(orderShare({ foundingTester: false }));
    await renderScreen(<OrderShareScreen />);

    expect(screen.getByLabelText(/^Story picture: Delivered by GRIDGO\. Printed for Ana\. With a QR code/)).toBeTruthy();
    expect(screen.queryByLabelText(/Founding Tester/)).toBeNull();
  });

  it("shares the code alone when GRIDGO has no invite link: no QR, no Send to a friend", async () => {
    serve(orderShare({ inviteLink: null }));
    await renderScreen(<OrderShareScreen />);

    expect(screen.getByLabelText(/With your invite code, 0123 4567 89AB CDEF 0123 4567\./)).toBeTruthy();
    expect(screen.queryByLabelText(/QR code/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Send to a friend" })).toBeNull();
    expect(screen.getByText("Post it to your story. Your friends can sign up with your invite code.")).toBeTruthy();
  });

  it("opened from the order's Share button, records nothing about the card and has no Maybe later", async () => {
    mockParams.presentation = "manual";
    serve(orderShare({}, { showAfterSurvey: false, closedAt: "t" }));
    await renderScreen(<OrderShareScreen />);

    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Maybe later" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    await waitFor(() => expect(api.prepareOrderShare).toHaveBeenCalledWith(ORDER));
    expect(api.recordShareCard).not.toHaveBeenCalled();
  });

  it("says so when the card cannot be got ready, and can still be closed", async () => {
    api.prepareOrderShare.mockRejectedValue(new TypeError("Network request failed"));
    await renderScreen(<OrderShareScreen />);

    expect(await screen.findByText("GRIDGO could not get your share card ready. Check your connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" }).props.accessibilityState.disabled).toBe(true);
    expect(api.recordShareCard).not.toHaveBeenCalled();
    expect(sharing.shareStory).not.toHaveBeenCalled();
  });
});
