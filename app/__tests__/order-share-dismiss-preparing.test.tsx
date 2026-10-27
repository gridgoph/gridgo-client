import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderShareScreen from "@/app/order/share";
import type { OrderShareRead } from "@/lib/api";
import { repeatDue } from "@/lib/orderShare";
import { useOrderShare } from "@/store/orderShare";
import { useSession } from "@/store/session";
import { renderScreen } from "@/test/renderScreen";
import { orderShare, shareRead } from "@/test/shareFixtures";
import { fakeShareServer } from "@/test/shareServer";

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

/** A server, and a `prepare` that has not answered yet. */
function serveWhilePreparing() {
  const server = fakeShareServer();
  api.recordShareCard.mockImplementation(server.recordShareCard);
  let answer: (read: OrderShareRead) => void = () => undefined;
  api.prepareOrderShare.mockReturnValue(new Promise<OrderShareRead>((resolve) => (answer = resolve)));
  return { server, answer: () => answer(shareRead(orderShare())) };
}

/** The one repeat is due on the next order visit, and its own Maybe later spends it. */
async function expectOneRepeat(server: ReturnType<typeof fakeShareServer>) {
  await waitFor(() => expect(useOrderShare.getState().pendingCards).toEqual([]));
  expect(repeatDue(server.current(), false)).toBe(true);

  await useOrderShare.getState().recordCard(ORDER, "order_repeat", "shown");
  await useOrderShare.getState().recordCard(ORDER, "order_repeat", "maybe_later");
  expect(useOrderShare.getState().pendingCards).toEqual([]);
  expect(repeatDue(server.current(), false)).toBe(false);
}

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: { id: "u1", email: "c@gridgo.local", name: "Ana Cruz", role: "client" } });
  useOrderShare.getState().reset();
  useOrderShare.setState({ pendingTaps: [], pendingCards: [] });
});

it("leaving the card while it is still getting ready counts as Maybe later", async () => {
  const { server, answer } = serveWhilePreparing();
  await renderScreen(<OrderShareScreen />);
  expect(screen.getByLabelText("Getting your share card ready")).toBeTruthy();
  expect(api.recordShareCard).not.toHaveBeenCalled();

  // The back gesture, before prepare has answered.
  await cleanup();
  await act(async () => answer());

  expect(api.recordShareCard.mock.calls).toEqual([
    [ORDER, "after_survey", "shown"],
    [ORDER, "after_survey", "maybe_later"],
  ]);
  expect(useOrderShare.getState().putOff[ORDER]).toBe(true);
  await expectOneRepeat(server);
});

/* The one press in this file. */
it("Maybe later while the card is still getting ready keeps the one repeat", async () => {
  const { server, answer } = serveWhilePreparing();
  await renderScreen(<OrderShareScreen />);

  fireEvent.press(screen.getByRole("button", { name: "Maybe later" }));

  expect(mockBack).toHaveBeenCalled();
  await waitFor(() =>
    expect(api.recordShareCard.mock.calls).toEqual([
      [ORDER, "after_survey", "shown"],
      [ORDER, "after_survey", "maybe_later"],
    ]),
  );
  // Prepare answering afterwards sends nothing more.
  await act(async () => answer());
  await cleanup();
  expect(api.recordShareCard).toHaveBeenCalledTimes(2);
  await expectOneRepeat(server);
});
