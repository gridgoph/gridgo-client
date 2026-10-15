import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { useCheckoutExit } from "@/store/checkoutExit";
import { EXIT_DUE, renderExitQuestion, setUpExitQuestion, showExitQuestion } from "@/test/checkoutExitHarness";

jest.mock("expo-router", () => ({ useSegments: () => ["(tabs)", "home"] }));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, claimCheckoutExitPrompt: jest.fn(), answerCheckoutExitPrompt: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.clearAllMocks();
  setUpExitQuestion();
});

/* One press per file (AGENTS.md, "Running and testing"). */
it("skips on GRIDGO's side and closes", async () => {
  api.answerCheckoutExitPrompt.mockResolvedValue({ serverTime: EXIT_DUE.serverTime, prompt: { ...EXIT_DUE.prompt, status: "skipped" } });
  showExitQuestion();
  await renderExitQuestion();

  fireEvent.press(screen.getByRole("button", { name: "Skip this question" }));

  await waitFor(() => expect(api.answerCheckoutExitPrompt).toHaveBeenCalledWith("cxp_1", { skip: true }));
  expect(useCheckoutExit.getState().open).toBe(false);
});
