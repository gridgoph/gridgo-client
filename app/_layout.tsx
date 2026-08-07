import "../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { multiOriginPushedScreenOptions } from "@/lib/navigationHeaders";
import { hasActiveSession } from "@/lib/sessionGuard";
import { useSession } from "@/store/session";
// Side-effect: rehydrate persisted theme preference from AsyncStorage.
import "@/store/theme";

SplashScreen.preventAutoHideAsync();

/** React Navigation reads plain colours, so it gets them from the token file. */
function navigationTheme(scheme: ThemeName): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const token = colors[scheme];

  return {
    ...base,
    dark: scheme === "dark",
    colors: {
      ...base.colors,
      background: token.canvas,
      card: token.surface,
      text: token.textPrimary,
      border: token.outline,
      primary: token.accent,
      notification: token.error,
    },
  };
}

export default function RootLayout() {
  const scheme = useThemeName();
  const token = useThemeColors();
  const fontsReady = useAppFonts();
  // Session drives Stack.Protected so sign-out / 401 / rejected role all leave
  // the signed-in area from anywhere (tabs + root stack siblings), not only at launch.
  const user = useSession((s) => s.user);
  const isSignedIn = hasActiveSession(user);

  // Keeps the window behind the navigator on canvas, so theme changes and
  // screen transitions never flash the wrong background.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(token.canvas);
  }, [token.canvas]);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync();
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme(scheme)}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: token.surface },
            headerTintColor: token.textPrimary,
            headerTitleStyle: {
              fontSize: typography.h3.fontSize,
              fontFamily: typography.h3.fontFamily,
            },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: token.canvas },
          }}
        >
          {/* Launch + public routes stay reachable; index maps session → entry. */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />

          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          </Stack.Protected>

          {/*
            Signed-in area. When the guard flips false (logout, 401, role reject),
            Expo Router removes these history entries so Android back cannot re-enter.
            Covers root-stack pushes outside (tabs): order/[id], design-system.
          */}
          <Stack.Protected guard={isSignedIn}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="order/[id]"
              options={{ title: "Order", ...multiOriginPushedScreenOptions }}
            />
            <Stack.Screen
              name="design-system"
              options={{
                title: "Design system",
                ...multiOriginPushedScreenOptions,
              }}
            />
          </Stack.Protected>
        </Stack>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
