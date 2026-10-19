import { fireEvent, screen } from "@testing-library/react-native";

import { useFoundingTester } from "@/store/foundingTester";
import { CELEBRATION_TITLE, renderCelebration, setUpCelebration } from "@/test/foundingTesterHarness";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useSegments: () => ["order", "[id]"],
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

beforeEach(() => setUpCelebration());

// The third mission is usually finished on an order's survey, so it plays there.
it("plays over the order a survey finished, and leads to the voucher", async () => {
  await renderCelebration();
  expect(await screen.findByText(CELEBRATION_TITLE)).toBeTruthy();

  fireEvent.press(screen.getByText("See my voucher"));

  expect(mockPush).toHaveBeenCalledWith("/vouchers");
  expect(useFoundingTester.getState().showing).toBeNull();
});
