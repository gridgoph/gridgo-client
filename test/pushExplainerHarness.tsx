import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PushExplainerSheet } from "@/components/PushExplainerSheet";
import { useAppUpdate } from "@/store/appUpdate";
import { usePush } from "@/store/push";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/** Shared set-up for the explainer's tests, which are split one press per file. */

export const DAY = 24 * 60 * 60 * 1000;

export function setUpExplainer(permission: "undetermined" | "blocked" | "granted" | "unknown") {
  useAppUpdate.getState().reset();
  usePushPrompt.setState({ hydrated: true, lastOfferedAt: null, open: false, mode: "ask" });
  usePush.setState({
    supported: true,
    permission,
    token: null,
    claimed: false,
    busy: false,
    error: null,
  });
  useSession.setState({
    user: { id: "u1", email: "client@gridgo.local", name: "Client", role: "client" },
  } as never);
}

export function renderExplainer(ready = true) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <PushExplainerSheet ready={ready} />
    </SafeAreaProvider>,
  );
}
