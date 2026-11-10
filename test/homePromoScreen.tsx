import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { resetPromotionSession } from "@/lib/homePromos";
import { useCart } from "@/store/cart";
import { useHomePromos } from "@/store/homePromos";
import { useHomeSummary } from "@/store/homeSummary";
import { useSession } from "@/store/session";

/**
 * Home with a live partner promo (client#402). The test file mocks
 * `expo-router` and `@/lib/api` (with `getHomePromotions` and
 * `recordPromotionEvent` as `jest.fn`s) itself; this holds the rest.
 */

export function davaogo(overrides: Record<string, unknown> = {}) {
  return {
    id: "promo_dgo",
    name: "DavaoGo",
    logo: { downloadUrl: "https://files.example/dgologo.png" },
    description: "Rides and deliveries around Davao.",
    tag: "partner",
    linkText: "Visit DavaoGo",
    linkUrl: "https://davaogo.app/",
    tapAction: "sheet",
    style: "yellow",
    ...overrides,
  };
}

export function resetHome() {
  resetPromotionSession();
  useHomeSummary.getState().clear();
  useHomePromos.getState().clear();
  useCart.getState().reset();
  useSession.setState({
    user: { id: "user_1", name: "Rina Cruz", email: "rina@example.com", role: "client", accountType: "personal" },
    token: "tok_test",
  } as never);
}

export function renderHome(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}
