import { screen } from "@testing-library/react-native";

import { useAppUpdate } from "@/store/appUpdate";
import { useCheckoutExit } from "@/store/checkoutExit";
import { useLegalConsent } from "@/store/legalConsent";
import { usePushPrompt } from "@/store/pushPrompt";
import { EXIT_DUE, pastSettle, renderExitQuestion, setUpExitQuestion } from "@/test/checkoutExitHarness";

/**
 * When the checkout exit question is asked. GRIDGO counts the claim as asking,
 * so the claim itself must wait for a clear screen. Every test before the last
 * renders a question that never opens: opening is a store write from an
 * effect, which spends this file's render budget (AGENTS.md, "Running and
 * testing"). The press tests live in their own files.
 */

let mockSegments: string[] = ["(tabs)", "home"];
jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, claimCheckoutExitPrompt: jest.fn(), answerCheckoutExitPrompt: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const QUESTION = "What stopped you from ordering?";

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments = ["(tabs)", "home"];
  setUpExitQuestion();
  api.claimCheckoutExitPrompt.mockResolvedValue(EXIT_DUE);
});

it("waits for the launch intro", async () => {
  await renderExitQuestion(false);
  await pastSettle();
  expect(api.claimCheckoutExitPrompt).not.toHaveBeenCalled();
});

it("is never asked off the tab shell, at checkout or over a survey", async () => {
  mockSegments = ["checkout"];
  await renderExitQuestion();
  await pastSettle();
  expect(api.claimCheckoutExitPrompt).not.toHaveBeenCalled();
});

it("never stacks on the update prompt or the notification explainer", async () => {
  useAppUpdate.setState({ promptOpen: true });
  usePushPrompt.setState({ open: true });
  await renderExitQuestion();
  await pastSettle();
  expect(api.claimCheckoutExitPrompt).not.toHaveBeenCalled();
});

it("waits while terms are waiting to be agreed", async () => {
  useLegalConsent.setState({ userId: "u1", status: "blocked" } as never);
  await renderExitQuestion();
  await pastSettle();
  expect(api.claimCheckoutExitPrompt).not.toHaveBeenCalled();
});

it("holds a claimed question until the screen is clear", async () => {
  useCheckoutExit.setState({ prompt: EXIT_DUE.prompt, checked: useCheckoutExit.getState().foreground });
  useAppUpdate.setState({ promptOpen: true });
  await renderExitQuestion();
  await pastSettle();
  expect(useCheckoutExit.getState().open).toBe(false);
  expect(screen.queryByText(QUESTION)).toBeNull();
});

// Last: the question opens, which is a store write from an effect.
it("asks once the screen has been clear, with six one-tap answers, Other and Skip", async () => {
  await renderExitQuestion();

  expect(await screen.findByText(QUESTION, {}, { timeout: 4_000 })).toBeTruthy();
  expect(api.claimCheckoutExitPrompt).toHaveBeenCalledTimes(1);
  for (const label of [
    "The price was too high",
    "Delivery cost or time",
    "Still deciding",
    "Trouble paying",
    "Found another option",
    "Just looking around",
  ]) {
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
  }
  expect(screen.getByRole("button", { name: "Other" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Skip this question" })).toBeTruthy();
  // Feedback, not a sale: no reward is offered for it.
  expect(screen.queryByText(/voucher|reward|₱/i)).toBeNull();
});
