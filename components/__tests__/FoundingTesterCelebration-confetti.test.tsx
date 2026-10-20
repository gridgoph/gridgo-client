import { screen } from "@testing-library/react-native";

import { foundingTesterView, type EarnedView } from "@/lib/foundingTester";
import { useFoundingTester } from "@/store/foundingTester";
import { AWARDED_AT, CELEBRATION_TITLE, EARNED, renderCelebration, setUpCelebration } from "@/test/foundingTesterHarness";

/*
  The celebration's confetti, and that reduce motion goes without it. The
  sheet is put up before the render rather than by the effect, so neither test
  spends this file's render budget on a store write (AGENTS.md § "Running and
  testing").
*/

let mockReduceMotion = false;
jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => mockReduceMotion }));
jest.mock("expo-router", () => ({ useSegments: () => ["(tabs)", "home"], router: { push: jest.fn() } }));

function open() {
  setUpCelebration(EARNED, { u1: AWARDED_AT });
  useFoundingTester.setState({ showing: foundingTesterView({ foundingTester: EARNED }) as EarnedView });
}

it("throws confetti over the badge and ticks all five steps", async () => {
  mockReduceMotion = false;
  open();
  await renderCelebration();

  expect(await screen.findByText(CELEBRATION_TITLE)).toBeTruthy();
  expect(screen.getByTestId("founding-tester-confetti", { includeHiddenElements: true })).toBeTruthy();
  for (const title of ["Add an item to your cart", "Place your order", "Track your order", "Receive your order", "Complete the survey"]) {
    expect(screen.getByText(title)).toBeTruthy();
  }
});

it("draws no confetti when the phone asks for reduced motion", async () => {
  mockReduceMotion = true;
  open();
  await renderCelebration();

  expect(await screen.findByText(CELEBRATION_TITLE)).toBeTruthy();
  expect(screen.queryByTestId("founding-tester-confetti", { includeHiddenElements: true })).toBeNull();
  expect(screen.getByText(/A ₱15 voucher is in your wallet/)).toBeTruthy();
});
