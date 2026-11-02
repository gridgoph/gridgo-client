import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { QuickActionsSheet } from "@/components/QuickActionsSheet";
import { useHomeSummary } from "@/store/homeSummary";
import { useQuickActions } from "@/store/quickActions";
import { useSession } from "@/store/session";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * Shared set-up for the "+" sheet's tests, split one press per file. Each
 * test file mocks `expo-router` and `@/lib/api` itself (jest hoists mocks
 * per file), the API through `test/quickActionsApiMock.ts`.
 */

export function setUpQuickActions({ tester = true, unread = 0 } = {}) {
  useQuickActions.setState({ open: true });
  useHomeSummary.setState({ summary: null, owner: null, loading: false, failed: false });
  useSupportChatStore.setState({ unreadCount: unread } as never);
  useSession.setState({
    user: {
      id: "u1",
      email: "client@gridgo.local",
      name: "Rina Cruz",
      role: "client",
      foundingTester: tester
        ? {
            eligible: true,
            label: null,
            awardedAt: null,
            missions: { added: true, placed: true, tracked: false, received: false, rated: false },
            completedCount: 2,
            rewardStatus: "pending",
            reward: null,
          }
        : null,
    },
  } as never);
}

export function renderQuickActions() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QuickActionsSheet />
    </SafeAreaProvider>,
  );
}
