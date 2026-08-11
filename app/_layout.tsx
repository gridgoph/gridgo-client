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
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors, radius, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { usePushNotifications } from "@/hooks/usePushNotifications";
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

  // Registration, token rotation, and opening the right screen from a tapped
  // notification. Mounted once, above every route, so a tap that launched the
  // app is picked up before any screen has decided anything. It never asks for
  // permission — only `PushEnableCard` does that, and only from a tap.
  usePushNotifications();

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
      {/*
        Every input in the app reads the keyboard through this.

        React Native's own `KeyboardAvoidingView` needs a different `behavior`
        per platform, knows nothing about a scroll view's content inset, and
        never scrolls a focused field into view — so a long form (the request
        stepper, sign-up) could pad its container correctly and still leave the
        field being typed into under the keyboard. `KeyboardProvider` feeds the
        real keyboard frame to `FormScreen`'s aware scroll view, which does
        scroll to the caret, and it works inside a React Native `Modal` (the
        option sheets) as of 1.13.
        Do not pass `statusBarTranslucent` / `navigationBarTranslucent`: Expo's
        Android is edge-to-edge from SDK 54, the library detects that, and
        setting them is what the library warns about. On web every binding is a
        documented no-op, so the aware scroll view is simply a scroll view.
      */}
      <KeyboardProvider>
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
              {/*
                The header is hidden, but the title still matters: it is what a
                pushed screen's back control falls back to. Without it the signup
                screen's back link reads `(auth)/login` on web — the same class of
                leak the `(tabs)` title below guards against.
              */}
              <Stack.Screen
                name="(auth)/login"
                options={{ headerShown: false, title: "Sign in" }}
              />
              {/*
                Signing up is pushed above the sign-in screen, so it keeps a
                labelled way back to it. The band names the flow rather than
                repeating "Create your account" from the heading below it.
              */}
              <Stack.Screen
                name="(auth)/signup"
                options={pushedScreenOptions("New account")}
              />
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
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
