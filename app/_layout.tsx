import { ReceiptOcrHost } from "@/components/ReceiptOcrHost";
import { useGridgoCharges } from "@/hooks/useGridgoCharges";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { useSupportChatUnread } from "@/hooks/useSupportChatUnread";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import "../global.css";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "expo-router/react-navigation";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { AppUpdateSheet } from "@/components/AppUpdateSheet";
import { BrandIntro } from "@/components/BrandIntro";
import { colors, radius, type ThemeName, typography } from "@/constants/theme";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useAppUpdateCheck } from "@/hooks/useAppUpdateCheck";
import { useClerkApiSession } from "@/hooks/useClerkApiSession";
import { useClientPreferences } from "@/hooks/useClientPreferences";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { resolveClerkPublishableKey } from "@/lib/clerkAuth";
import { bounceToIsolatedDevWebHost, GRIDGO_DEV_WEB_HOST } from "@/lib/devWebHost";
import {
  androidEdgeToEdgeHeaderOptions,
  pushedScreenOptions,
} from "@/lib/navigationHeaders";
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
  if (bounceToIsolatedDevWebHost(GRIDGO_DEV_WEB_HOST)) {
    return null;
  }

  const publishableKey = resolveClerkPublishableKey(
    Constants.expoConfig?.extra?.clerkPublishableKey,
    __DEV__,
  );

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppNavigation />
    </ClerkProvider>
  );
}

function AppNavigation() {
  const scheme = useThemeName();
  const token = useThemeColors();
  const fontsReady = useAppFonts();
  // Session drives Stack.Protected so sign-out / 401 / rejected role all leave
  // the signed-in area from anywhere (tabs + root stack siblings), not only at launch.
  const user = useSession((s) => s.user);
  const isSignedIn = hasActiveSession(user);

  useClerkApiSession();

  // What this account asked GRIDGO to match on, read once a session exists.
  // The landing ladder waits on it, so it cannot live in the ranking screen.
  useClientPreferences();

  // Registration, token rotation, and opening the right screen from a tapped
  // notification. Mounted once, above every route, so a tap that launched the
  // app is picked up before any screen has decided anything. It never asks for
  // permission — only `PushEnableCard` does that, and only from a tap.
  usePushNotifications();
  useLiveNotifications();
  useSupportChatUnread();

  // GRIDGO's charges, read as soon as a session exists: every price the app
  // draws is the shop's figure plus GRIDGO's charge, from the first match row.
  useGridgoCharges();

  // A newer sideloaded release, looked for on launch and on return to the
  // foreground. Not tied to a session: an old build is old signed out too.
  useAppUpdateCheck();

  // Keeps the window behind the navigator on canvas, so theme changes and
  // screen transitions never flash the wrong background.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(token.canvas);
  }, [token.canvas]);

  // Hold the native splash until Satoshi is on the device. A release build
  // embeds the files through the expo-font plugin, so this is the first
  // frame. Expo Go still loads them at runtime; hiding earlier is how the
  // welcome headline painted in the system UI font.
  useEffect(() => {
    if (!fontsReady) return;
    void SplashScreen.hideAsync();
  }, [fontsReady]);

  // The opening plays once per launch, over everything. This layout mounts
  // once, so the flag is the whole gate — no route, no back-stack entry, and
  // nothing about where the launch lands is decided here.
  const [introPlaying, setIntroPlaying] = useState(true);

  return (
    /*
      Insets synchronously, from the native module, on the very first frame.
      Without `initialWindowMetrics` the provider reports zero until it has
      measured, so every screen shell — and the tab bar's bottom padding —
      lays out once at the wrong size and again a frame later. On a phone that
      is a visible settle as content drops under the status bar.
    */
    /*
      The gesture root. Nothing built on react-native-gesture-handler responds
      on Android without it, and the deadline calendar's month strip is
      dragged: tracking a finger from the UI thread is the difference between
      a page being turned and an animation being played afterwards.

      `Sheet` and `NotificationCard` deliberately stay on PanResponder — a
      React Native `Modal` renders outside this tree, so a gesture detector in
      one never fires. Mounting this changes neither.
    */
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
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
              key={user?.id ?? "signed-out"}
              screenOptions={{
                headerStyle: { backgroundColor: token.surface },
                headerTintColor: token.textPrimary,
                headerTitleStyle: {
                  fontSize: typography.h3.fontSize,
                  fontFamily: typography.h3.fontFamily,
                },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: token.canvas },
                ...androidEdgeToEdgeHeaderOptions,
              }}
            >
              {/* Launch + public routes stay reachable; index maps session → entry. */}
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="complete-profile" options={{ headerShown: false }} />
              <Stack.Screen
                name="sso-callback"
                options={{ headerShown: false, title: "Signing in" }}
              />

              <Stack.Protected guard={!isSignedIn}>
                {/*
                  Welcome is the door and has no back destination, so its
                  header stays hidden. The title still matters: it is what a
                  pushed screen's back control falls back to. Login and signup
                  use the platform back — the same bare chevron as every other
                  pushed screen — rather than a custom round control.
                */}
                <Stack.Screen
                  name="(auth)/welcome"
                  options={{ headerShown: false, title: "Welcome" }}
                />
                <Stack.Screen
                  name="(auth)/login"
                  options={pushedScreenOptions("Sign in")}
                />
                <Stack.Screen
                  name="(auth)/signup"
                  options={pushedScreenOptions("Sign up")}
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
                {/*
                  Ranking quality, speed and distance. Reached once as the last
                  rung of the landing ladder, and again from Settings — one
                  screen either way, so the ranking a client edits is the same
                  ranking they first set.
                */}
                <Stack.Screen name="priorities" options={pushedScreenOptions("Matching")} />
                {/*
                  Where the job goes, asked before the match when the client put
                  distance first. Part of the same flow as the category screens,
                  so it carries the same band.
                */}
                <Stack.Screen
                  name="request/where"
                  options={pushedScreenOptions("New request")}
                />
                {/*
                  GRIDGO's match. Not named in the band: the screen's own
                  heading already says what the job is, and repeating it in the
                  header would spend the band saying nothing new.
                */}
        {/*
          The deadline, asked before any shop is chosen. It is the one question
          that means the same thing at every shop, so the only one that can
          decide which of them are offered at all.
        */}
        <Stack.Screen
          name="request/when"
          options={pushedScreenOptions("When you need it")}
        />
                <Stack.Screen
                  name="request/match"
                  options={pushedScreenOptions("New request")}
                />
                <Stack.Screen
                  name="request/listing"
                  options={pushedScreenOptions("Listing")}
                />
                <Stack.Screen
                  name="request/artwork"
                  options={pushedScreenOptions("Artwork")}
                />
                {/*
                  Operations. Header only, never a tab: this is correspondence
                  about work already in flight, not one of the four places the
                  app lives. The band names the area; the screen names the desk.
                */}
                <Stack.Screen name="chat/index" options={pushedScreenOptions("Chat")} />
                <Stack.Screen name="chat/[thread]" options={pushedScreenOptions("Chat")} />
                <Stack.Screen name="checkout" options={pushedScreenOptions("Checkout")} />
                <Stack.Screen name="order/[id]" options={pushedScreenOptions("Order")} />
                <Stack.Screen
                  name="order/receipt"
                  options={pushedScreenOptions("Receipt")}
                />
                <Stack.Screen
                  name="order/physical-invoice"
                  options={pushedScreenOptions("Physical invoice")}
                />
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
                {/*
                  Rating a finished job. It was a content-sized sheet like the
                  proof-change ask, and on a phone three star questions plus a
                  note outgrew the sheet with no way to scroll to the button.
                  So it is an ordinary pushed screen with the checkout's shape:
                  a scrolling form under a pinned commit bar.
                */}
                <Stack.Screen name="order/rate" options={pushedScreenOptions("Rate this order")} />
                <Stack.Screen
                  name="design-system"
                  options={pushedScreenOptions("Design system")}
                />
                <Stack.Screen name="settings" options={pushedScreenOptions("Settings")} />
                {/*
                  The account's own details. The band names the screen, so the
                  form below it opens straight on the record rather than
                  spending a display heading repeating the header.
                */}
                <Stack.Screen
                  name="account-details"
                  options={pushedScreenOptions("Your details")}
                />
                {/*
                  Grab-shaped list of Home / Work / named drop-offs. The band
                  names the list; Add home / Add work are the rows, and the
                  editor they open carries its own heading.
                */}
                <Stack.Screen
                  name="saved-places"
                  options={pushedScreenOptions("Saved Places")}
                />
                <Stack.Screen
                  name="saved-place"
                  options={pushedScreenOptions("Saved Places")}
                />
                {/*
                  The two halves of the sign-in that take steps rather than
                  keystrokes. The band names the thing being changed, because
                  each screen's own heading says what is being done to it —
                  "Change your sign-in email" under a band reading "Email".
                */}
                <Stack.Screen
                  name="change-email"
                  options={pushedScreenOptions("Email")}
                />
                <Stack.Screen
                  name="change-password"
                  options={pushedScreenOptions("Password")}
                />
                {/*
                  Becoming a business client. Each step carries its own
                  question as the heading, so the band names the flow they are
                  in and never repeats what is under it.
                */}
                <Stack.Screen
                  name="business-apply"
                  options={pushedScreenOptions("Apply as a business")}
                />
              </Stack.Protected>
            </Stack>
            <ReceiptOcrHost />
            {/* Held back until the intro has finished, so it never lands under it. */}
            <AppUpdateSheet ready={!introPlaying && fontsReady} />
            <StatusBar style={scheme === "dark" ? "light" : "dark"} />
            {introPlaying ? <BrandIntro onDone={() => setIntroPlaying(false)} /> : null}
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
