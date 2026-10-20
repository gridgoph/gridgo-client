import { screen, waitFor } from "@testing-library/react-native";

import * as api from "@/lib/api";
import { useFoundingTester } from "@/store/foundingTester";
import { AWARDED_AT, CELEBRATION_TITLE, EARNED, renderCelebration, setUpCelebration } from "@/test/foundingTesterHarness";

/**
 * An award this installation did not see arrive is history, and the
 * celebration waits on the installation being registered. The last test
 * writes to the store from an effect, so it goes last (AGENTS.md § "Running
 * and testing").
 */

jest.mock("expo-router", () => ({
  useSegments: () => ["(tabs)", "home"],
  router: { push: jest.fn() },
}));

it("waits until GRIDGO has heard which installation this is (review finding 9)", async () => {
  // The installation call is still out.
  jest.spyOn(api, "recordTesterInstallation").mockImplementation(() => new Promise(() => {}));
  setUpCelebration(EARNED, {}, { installation: "pending" });
  await renderCelebration();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
  expect(useFoundingTester.getState().showing).toBeNull();
});

// Last: recording the old award is a store write from an effect.
it("does not replay an old award after the app's storage is lost — a reinstall (review finding 5)", async () => {
  // Nothing celebrated and nothing seen: a fresh installation reading an account that already has the label.
  jest.restoreAllMocks();
  setUpCelebration(EARNED, {}, { seenOpen: {} });
  await renderCelebration();

  await waitFor(() => expect(useFoundingTester.getState().celebrated).toEqual({ u1: AWARDED_AT }));
  expect(useFoundingTester.getState().showing).toBeNull();
  expect(screen.queryByText(CELEBRATION_TITLE)).toBeNull();
});
