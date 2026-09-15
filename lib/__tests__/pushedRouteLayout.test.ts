import { createElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import RootLayout from "@/app/_layout";
import { HeaderThemeButton } from "@/components/HeaderThemeButton";
import { PushedStackHeader } from "@/components/PushedStackHeader";
import { colors, typography } from "@/constants/theme";

let mockUser: { id: string } | null = null;

jest.mock("@/global.css", () => ({}));
jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("@/lib/clerkAuth", () => ({ resolveClerkPublishableKey: () => "test" }));
jest.mock("@/store/session", () => ({
  useSession: (select: (state: { user: typeof mockUser }) => unknown) => select({ user: mockUser }),
}));
jest.mock("@/hooks/useTheme", () => ({
  useThemeName: () => "dark",
  useThemeColors: () => jest.requireActual("@/constants/theme").colors.dark,
}));
jest.mock("@/hooks/useAppFonts", () => ({ useAppFonts: jest.fn() }));
jest.mock("@/hooks/useClerkApiSession", () => ({ useClerkApiSession: jest.fn() }));
jest.mock("@/hooks/useClientPreferences", () => ({ useClientPreferences: jest.fn() }));
jest.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: jest.fn() }));
jest.mock("@/hooks/useLiveNotifications", () => ({ useLiveNotifications: jest.fn() }));
jest.mock("@/components/BrandIntro", () => ({ BrandIntro: () => null }));
jest.mock("@/store/theme", () => ({ useThemeStore: jest.fn() }));
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: jest.requireActual("react-native").View,
}));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-router/react-navigation", () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const Stack = (props: object) => React.createElement(View, { ...props, testID: "root-stack" });
  Stack.Screen = function StackScreen(props: { name: string }) {
    return React.createElement(View, { ...props, testID: `route:${props.name}` });
  };
  Stack.Protected = function StackProtected({ guard, children }: { guard: boolean; children: ReactNode }) {
    return guard ? children : null;
  };
  return { Stack };
});

describe("pushed route layout contract", () => {
  it.each([false, true])("configures reachable headers with signedIn=%s", async (signedIn) => {
    mockUser = signedIn ? { id: "client" } : null;
    jest.replaceProperty(Platform, "OS", "android");
    try {
      await render(createElement(RootLayout));
      const defaults = screen.getByTestId("root-stack").props.screenOptions;
      expect(defaults.statusBarTranslucent).toBe(true);
      expect(defaults.headerStyle.backgroundColor).toBe(colors.dark.surface);
      expect(defaults.headerTitleStyle.fontFamily).toBe(typography.h3.fontFamily);

      const routes = screen.getAllByTestId(/^route:/);
      expect(routes.map((route) => route.props.name)).toEqual(expect.arrayContaining(
        signedIn
          ? ["(tabs)", "request/category", "request/[category]", "order/[id]", "settings", "design-system"]
          : ["(auth)/welcome", "(auth)/login", "(auth)/signup"],
      ));
      const pushed = routes.filter((route) => route.props.options.headerShown !== false);
      expect(pushed.length).toBeGreaterThan(0);
      for (const route of pushed) {
        const options = { ...defaults, ...route.props.options };
        expect(options.title.trim().length).toBeGreaterThan(0);
        expect(options.headerBackButtonDisplayMode).toBe("minimal");
        expect(options.statusBarTranslucent).toBe(true);
        expect(options.header).toBe(PushedStackHeader);
        expect(options.headerRight).toBe(HeaderThemeButton);
      }
      if (signedIn) {
        expect(screen.getByTestId("route:request/category").props.options.title).toBe("New request");
        expect(screen.getByTestId("route:(tabs)").props.options.headerShown).toBe(false);
      } else {
        expect(screen.getByTestId("route:(auth)/login").props.options.title).toBe("Sign in");
        expect(screen.getByTestId("route:(auth)/signup").props.options.title).toBe("Sign up");
        expect(screen.getByTestId("route:(auth)/welcome").props.options.headerShown).toBe(false);
      }
    } finally {
      jest.restoreAllMocks();
    }
  });
});
