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

import { colors, radius, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { pushedScreenOptions } from "@/lib/navigationHeaders";
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
            {/*
              The tab shell draws its own per-tab headers, so its header is
              hidden — but it still carries a title. Every screen pushed above
              it sets its own back label; this is the second line of defence,
              so that if one ever forgets, iOS labels the back control "GRIDGO"
              and never the filesystem name `(tabs)`.
            */}
            <Stack.Screen
              name="(tabs)"
              options={{ headerShown: false, title: "GRIDGO" }}
            />
            {/*
              Choosing what to print: two screens of one flow, so the band
              names the flow rather than the screen. Neither title repeats the
              heading below it — "New request" says what picking a category
              leads to, which is the thing a client browsing in from Home does
              not otherwise know.
            */}
            <Stack.Screen
              name="request/category"
              options={pushedScreenOptions("New request")}
            />
            {/*
              Not the category name: "Marketing & promotional collateral" is
              two lines of h1 on a 390pt phone and would be truncated to
              nonsense in a header. The screen's own heading carries it.
            */}
            <Stack.Screen
              name="request/[category]"
              options={pushedScreenOptions("New request")}
            />
            <Stack.Screen name="order/[id]" options={pushedScreenOptions("Order")} />
            {/*
              Asking for a change to a proof is a real destination with a
              keyboard in it, so it gets the platform's own sheet: drag to
              dismiss, back gesture, keyboard avoidance and focus containment
              for free. `fitToContents` keeps it the height of its content.
            */}
            <Stack.Screen
              name="order/request-changes"
              options={{
                presentation: "formSheet",
                headerShown: false,
                sheetAllowedDetents: "fitToContents",
                sheetGrabberVisible: true,
                sheetCornerRadius: radius.lg,
                contentStyle: { backgroundColor: token.surface },
              }}
            />
            <Stack.Screen
              name="design-system"
              options={pushedScreenOptions("Design system")}
            />
            <Stack.Screen name="settings" options={pushedScreenOptions("Settings")} />
          </Stack.Protected>
        </Stack>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
