import { createElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import RootLayout from "@/app/_layout";
import { useAppUpdate } from "@/store/appUpdate";

jest.mock("@/global.css", () => ({}));
jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
jest.mock("@/lib/clerkAuth", () => ({ resolveClerkPublishableKey: () => "test" }));
let mockUser: { id: string } | null = null;
jest.mock("@/store/session", () => ({
  useSession: (select: (state: { user: typeof mockUser }) => unknown) => select({ user: mockUser }),
}));
jest.mock("@/hooks/useAppFonts", () => ({ useAppFonts: jest.fn(() => true) }));
jest.mock("@/hooks/useClerkApiSession", () => ({ useClerkApiSession: jest.fn() }));
jest.mock("@/hooks/useClientPreferences", () => ({ useClientPreferences: jest.fn() }));
jest.mock("@/hooks/usePushNotifications", () => ({ usePushNotifications: jest.fn() }));
jest.mock("@/hooks/useLiveNotifications", () => ({ useLiveNotifications: jest.fn() }));
jest.mock("@/hooks/useSupportChatUnread", () => ({ useSupportChatUnread: jest.fn() }));
jest.mock("@/hooks/useGridgoCharges", () => ({ useGridgoCharges: jest.fn() }));
// The intro finishes on its own, the way it does on a phone.
jest.mock("@/components/BrandIntro", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    BrandIntro: ({ onDone }: { onDone: () => void }) => {
      useEffect(() => {
        const timer = setTimeout(onDone, 50);
        return () => clearTimeout(timer);
      }, [onDone]);
      return null;
    },
  };
});
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
  Stack.Screen = function StackScreen() {
    return null;
  };
  Stack.Protected = function StackProtected({
    guard,
    children,
  }: {
    guard: boolean;
    children: ReactNode;
  }) {
    return guard ? children : null;
  };
  return { Stack, useSegments: () => [] };
});
// Expo Go: no real versionCode, so only the dev override can make a build.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    appOwnership: "expo",
    executionEnvironment: "storeClient",
    expoConfig: { version: "1.0.0", android: { versionCode: 1 }, extra: {} },
  },
}));

beforeEach(() => {
  useAppUpdate.getState().reset();
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE = "90";
  jest.replaceProperty(Platform, "OS", "android");
  (global.fetch as jest.Mock).mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: "v1.0.95", draft: false, prerelease: false }),
  }));
});

afterEach(() => {
  mockUser = null;
  delete process.env.EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE;
  jest.restoreAllMocks();
});

// The path firstmate tests on a phone: Expo Go on Android, served by
// `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE=90 npx expo start --go`, the
// real root layout from launch through the intro to the prompt.
describe("root layout, forced update check in Expo Go", () => {
  it("offers the latest release once the intro is over, and logs why", async () => {
    await render(createElement(RootLayout));
    expect(
      await screen.findByText("A new version of GRIDGO is ready", {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.getByLabelText("On this phone: 1.0.90. Ready to install: 1.0.95.")).toBeTruthy();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      "[update-check] installed 1.0.90 (versionCode 90, forced by override)",
    );
    expect(console.info).toHaveBeenCalledWith("[update-check] latest release is 1.0.95");
    expect(console.info).toHaveBeenCalledWith("[update-check] offering 1.0.95 over 1.0.90");
  });

  // Clerk can restore a saved session after the intro, which re-keys the root
  // stack. The sheet sits beside the stack, so that must neither close it nor
  // count as "Later" (the supplier app's sheet did both).
  it("keeps the offer open when a restored session rebuilds the stack", async () => {
    await render(createElement(RootLayout));
    await screen.findByText("A new version of GRIDGO is ready", {}, { timeout: 3000 });

    mockUser = { id: "client" };
    await screen.rerender(createElement(RootLayout));

    expect(screen.getByText("A new version of GRIDGO is ready")).toBeTruthy();
    expect(useAppUpdate.getState()).toMatchObject({ promptOpen: true, dismissed: null });
  });
});
