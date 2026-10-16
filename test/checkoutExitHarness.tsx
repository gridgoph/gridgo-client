import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CheckoutExitQuestion } from "@/components/CheckoutExitQuestion";
import type { CheckoutExitPrompt } from "@/lib/api";
import { DEFAULT_CHECKOUT_EXIT_OPTIONS } from "@/lib/checkoutExit";
import { useAppUpdate } from "@/store/appUpdate";
import { useCheckoutExit } from "@/store/checkoutExit";
import { useLegalConsent } from "@/store/legalConsent";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/** Shared set-up for the exit question's tests, which are split one press per file. */

export const EXIT_PROMPT: CheckoutExitPrompt = {
  id: "cxp_1",
  question: "What stopped you from ordering?",
  status: "unanswered",
  reachedAt: "2026-10-16T07:40:00.000Z",
  askedAt: "2026-10-16T09:00:00.000Z",
  answeredAt: null,
  skippedAt: null,
  reason: null,
  otherText: null,
};

export const EXIT_DUE = {
  serverTime: "2026-10-16T09:00:00.000Z",
  question: EXIT_PROMPT.question,
  options: DEFAULT_CHECKOUT_EXIT_OPTIONS,
  prompt: EXIT_PROMPT,
  nextEligibleAt: "2026-10-23T09:00:00.000Z",
};

export function setUpExitQuestion() {
  useAppUpdate.getState().reset();
  usePushPrompt.setState({ hydrated: true, lastOfferedAt: Date.now(), open: false, mode: "ask" });
  useSession.setState({
    user: { id: "u1", email: "client@gridgo.local", name: "Client", role: "client" },
  } as never);
  useLegalConsent.setState({ userId: "u1", status: "clear" } as never);
  useCheckoutExit.getState().reset();
}

/** The question already claimed and on screen. */
export function showExitQuestion(patch: Partial<ReturnType<typeof useCheckoutExit.getState>> = {}) {
  useCheckoutExit.setState({
    prompt: EXIT_PROMPT,
    question: EXIT_PROMPT.question,
    options: DEFAULT_CHECKOUT_EXIT_OPTIONS,
    open: true,
    checked: useCheckoutExit.getState().foreground,
    ...patch,
  });
}

export function renderExitQuestion(ready = true) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <CheckoutExitQuestion ready={ready} />
    </SafeAreaProvider>,
  );
}

/** Longer than the settle wait, so a claim that was going to happen has happened. */
export function pastSettle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1_700));
}
