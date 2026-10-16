import { fireEvent, screen, waitFor } from "@testing-library/react-native";

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
it("sends Other with the words written", async () => {
  api.answerCheckoutExitPrompt.mockResolvedValue({ serverTime: EXIT_DUE.serverTime, prompt: { ...EXIT_DUE.prompt, status: "answered" } });
  showExitQuestion({ writingOther: true, otherText: "Needed it by Friday" });
  await renderExitQuestion();
  expect(screen.getByText("19/500")).toBeTruthy();

  fireEvent.press(screen.getByRole("button", { name: "Send answer" }));

  await waitFor(() =>
    expect(api.answerCheckoutExitPrompt).toHaveBeenCalledWith("cxp_1", { reason: "other", otherText: "Needed it by Friday" }),
  );
  expect(await screen.findByText("Thank you. GRIDGO reads every answer.")).toBeTruthy();
});
