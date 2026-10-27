import { act, screen } from "@testing-library/react-native";

import { useFoundingTester } from "@/store/foundingTester";
import { useOrderShare } from "@/store/orderShare";
import { CELEBRATION_TITLE, renderCelebration, setUpCelebration } from "@/test/foundingTesterHarness";

/**
 * A survey can earn the label and offer the share card in the same moment.
 * The card comes first; the celebration waits until it has closed, so the
 * two never stack (gridgo-client#341).
 */

const mockSegments: string[] = ["order", "survey"];
jest.mock("expo-router", () => ({
  useSegments: () => mockSegments,
  router: { push: jest.fn() },
}));

beforeEach(() => {
  setUpCelebration();
  useOrderShare.getState().reset();
});

it("waits while the share card is being decided or is on screen, then plays", async () => {
  useOrderShare.getState().holdForSurvey("ord_1");
  await renderCelebration();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();

  await act(async () => useOrderShare.getState().setPresenting({ orderId: "ord_1", presentation: "after_survey" }));
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
  expect(useFoundingTester.getState().showing).toBeNull();

  await act(async () => useOrderShare.getState().setPresenting(null));
  expect(await screen.findByText(CELEBRATION_TITLE)).toBeTruthy();
});
