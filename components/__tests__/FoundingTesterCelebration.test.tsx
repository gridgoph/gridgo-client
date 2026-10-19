import { act, screen, waitFor } from "@testing-library/react-native";

import { useFoundingTester } from "@/store/foundingTester";
import { useSession } from "@/store/session";
import {
  AWARDED_AT,
  CELEBRATION_TITLE,
  EARNED,
  renderCelebration,
  setUpCelebration,
} from "@/test/foundingTesterHarness";

/**
 * When "You're a Founding Tester" plays. Every test before the last renders a
 * celebration that stays shut, because opening it is a store write from an
 * effect and that spends this file's render budget — see AGENTS.md
 * § "Running and testing". The press lives in its own file.
 */

let mockSegments: string[] = ["(tabs)", "home"];
jest.mock("expo-router", () => ({
  useSegments: () => mockSegments,
  router: { push: jest.fn() },
}));

beforeEach(() => {
  mockSegments = ["(tabs)", "home"];
  setUpCelebration();
});

it("waits for the launch intro", async () => {
  await renderCelebration(false);
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
  expect(useFoundingTester.getState().celebrated).toEqual({});
});

it("is never drawn over sign-in, onboarding or complete profile", async () => {
  mockSegments = ["complete-profile"];
  await renderCelebration();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
});

it("waits for the phone's memory, so a cold start cannot replay it", async () => {
  useFoundingTester.setState({ hydrated: false });
  await renderCelebration();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
});

it("does not play again for an awardedAt this phone already celebrated", async () => {
  setUpCelebration(EARNED, { u1: AWARDED_AT });
  await renderCelebration();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
});

it("plays nothing while the missions are still open", async () => {
  setUpCelebration({ ...EARNED, label: null, awardedAt: null, reward: null, rewardStatus: "pending" });
  await renderCelebration();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
});

it("plays nothing for an ineligible account or an API without the field", async () => {
  setUpCelebration(null);
  await renderCelebration();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
  expect(useFoundingTester.getState().celebrated).toEqual({});
});

// Last: the celebration opens, which is a store write from an effect.
it("plays once when the label arrives, and a re-read of the account does not replay it", async () => {
  await renderCelebration();

  expect(await screen.findByText(CELEBRATION_TITLE)).toBeTruthy();
  expect(screen.getByText(/A ₱15 voucher is in your wallet/)).toBeTruthy();
  expect(screen.getByText("See my voucher")).toBeTruthy();
  // Remembered the moment it opens, so closing the app mid-way cannot replay it.
  expect(useFoundingTester.getState().celebrated).toEqual({ u1: AWARDED_AT });

  // Put away, then the account is read again — a resume, a survey retry.
  await act(async () => useFoundingTester.getState().close());
  await act(async () => {
    useSession.setState({
      user: { id: "u1", email: "client@gridgo.local", name: "Client", role: "client", foundingTester: { ...EARNED } },
    } as never);
  });
  await waitFor(() => expect(useFoundingTester.getState().showing).toBeNull());
  expect(useFoundingTester.getState().celebrated).toEqual({ u1: AWARDED_AT });
});
