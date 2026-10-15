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
it("sends a one-tap answer and says thank you", async () => {
  api.answerCheckoutExitPrompt.mockResolvedValue({ serverTime: EXIT_DUE.serverTime, prompt: { ...EXIT_DUE.prompt, status: "answered" } });
  showExitQuestion();
  await renderExitQuestion();

  fireEvent.press(screen.getByRole("button", { name: "The price was too high" }));

  await waitFor(() => expect(api.answerCheckoutExitPrompt).toHaveBeenCalledWith("cxp_1", { reason: "price_too_high" }));
  expect(await screen.findByText("Thank you. GRIDGO reads every answer.")).toBeTruthy();
  expect(api.claimCheckoutExitPrompt).not.toHaveBeenCalled();
  expect(useCheckoutExit.getState().sent).toBe(true);
});
