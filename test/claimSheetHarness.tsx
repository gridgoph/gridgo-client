import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PromotionClaimSheet } from "@/components/PromotionClaimSheet";
import { useAppUpdate } from "@/store/appUpdate";
import { useFoundingTester } from "@/store/foundingTester";
import { usePromotions } from "@/store/promotions";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/** The claim sheet's tests are split one press per file; this is what they share. */

/** A signed-in client on the tab shell with nothing else asking. */
export function setUpClaimSheet() {
  useAppUpdate.getState().reset();
  usePushPrompt.setState({ hydrated: true, lastOfferedAt: Date.now(), open: false, mode: "ask" });
  useFoundingTester.setState({ showing: null });
  useSession.setState({ user: { id: "u1", email: "ana@example.com", name: "Ana", role: "client" } } as never);
  usePromotions.getState().reset();
}

export function renderClaimSheet(ready = true) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <PromotionClaimSheet ready={ready} />
    </SafeAreaProvider>,
  );
}
