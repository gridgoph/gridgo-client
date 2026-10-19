import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { FoundingTesterCelebration } from "@/components/FoundingTesterCelebration";
import type { FoundingTester } from "@/lib/api";
import { useAppUpdate } from "@/store/appUpdate";
import { useFoundingTester } from "@/store/foundingTester";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/** Shared set-up for the celebration's tests, which are split one press per file. */

export const AWARDED_AT = "2026-10-20T08:00:00.000Z";

export const EARNED: FoundingTester = {
  eligible: true,
  label: "Founding Tester",
  awardedAt: AWARDED_AT,
  missions: { placed: true, received: true, rated: true },
  completedCount: 3,
  rewardStatus: "issued",
  reward: { id: "vch_1", valueMinor: 1500, expiresAt: "2026-11-19T08:00:00.000Z" },
};

export const CELEBRATION_TITLE = "You're a Founding Tester";

export function setUpCelebration(foundingTester: FoundingTester | null = EARNED, celebrated: Record<string, string> = {}) {
  useAppUpdate.getState().reset();
  usePushPrompt.setState({ hydrated: true, lastOfferedAt: Date.now(), open: false, mode: "ask" });
  useFoundingTester.setState({ hydrated: true, celebrated, showing: null });
  useSession.setState({
    user: { id: "u1", email: "client@gridgo.local", name: "Client", role: "client", foundingTester },
  } as never);
}

export function renderCelebration(ready = true) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <FoundingTesterCelebration ready={ready} />
    </SafeAreaProvider>,
  );
}
