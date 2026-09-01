import { useAuth, useClerk, useSignUp } from "@clerk/expo";
import { useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";
import { staysOnAuthScreen } from "@/lib/authLanding";
import { completeClerkAuth } from "@/lib/clerkComplete";
import { CLERK_SSO_TOKEN_WAIT } from "@/lib/clerkSignIn";
import {
  adoptGoogleSsoClient,
  createdSessionIdFromSsoReload,
  finishGoogleSsoReturn,
  googleSsoCreatedSessionId,
  googleSsoRotatingTokenNonce,
  reloadClerkSignInForSso,
} from "@/lib/googleSso";
import { useSession } from "@/store/session";

const login = "/(auth)/login" as Href;

/**
 * Clerk's default browser-SSO redirect target (`gridgoclient://sso-callback`).
 *
 * The browser is already gone. Activate the created session if Clerk handed
 * one over, or adopt the one that is already signed in — never start Google
 * again, and never replace to login, welcome, or `/` while adopt is still
 * in flight. A missing JWT on the first probe is normal after Google; retry
 * token and `/auth/me` and keep "Signing you in…" until Home, complete-profile,
 * a wrong-role refusal, or a session that is still dead after that wait.
 */
export default function SsoCallbackScreen() {
  const params = useLocalSearchParams();
  const { isLoaded, isSignedIn, getToken, sessionId } = useAuth();
  const clerk = useClerk();
  const { setActive, signOut } = clerk;
  const { signUp } = useSignUp();
  const landing = useAuthLanding();
  const colors = useThemeColors();
  const attempted = useRef(false);
  const [failed, setFailed] = useState(false);

  const createdSessionId = googleSsoCreatedSessionId(params);
  const rotatingTokenNonce = googleSsoRotatingTokenNonce(params);

  useEffect(() => {
    if (!isLoaded) return;
    const canFinish = Boolean(isSignedIn || createdSessionId || rotatingTokenNonce);
    if (!canFinish) return;
    if (attempted.current) return;
    attempted.current = true;
    // Raise this before any await so the root Clerk bridge will not treat a
    // still-empty JWT as a dead leftover and sign the Google session out.
    useSession.getState().beginClerkSync();

    let cancelled = false;
    void (async () => {
      try {
        let sessionFromNonce: string | null = null;
        if (!isSignedIn && !createdSessionId && rotatingTokenNonce) {
          const reloaded = await reloadClerkSignInForSso(clerk, rotatingTokenNonce);
          sessionFromNonce = await createdSessionIdFromSsoReload(reloaded, async () => {
            if (!signUp) return null;
            const transferred = await signUp.create({ transfer: true });
            if (
              transferred &&
              typeof transferred === "object" &&
              "error" in transferred &&
              transferred.error
            ) {
              throw transferred.error;
            }
            return signUp;
          });
        }

        const outcome = await finishGoogleSsoReturn({
          alreadySignedIn: Boolean(isSignedIn),
          createdSessionId: createdSessionId ?? sessionFromNonce,
          setActive: (args) => setActive(args),
        });
        if (cancelled) return;

        if (outcome.status !== "activated" && outcome.status !== "already_signed_in") {
          // Login's startSSOFlow may still be activating. Wait for isSignedIn.
          attempted.current = false;
          useSession.getState().endClerkSync();
          return;
        }

        const result = await adoptGoogleSsoClient({
          cancelled: () => cancelled,
          adopt: () =>
            completeClerkAuth({
              existingSessionId:
                outcome.status === "activated" ? outcome.sessionId : sessionId,
              getToken,
              signOut,
              sessionId,
              setActive: (args) => setActive(args),
              tokenWait: CLERK_SSO_TOKEN_WAIT,
            }),
        });
        if (cancelled) return;
        if (result.kind === "wrong_role") {
          setFailed(true);
          return;
        }
        if (result.kind === "error") {
          // Retries spent and still no client — confirmed dead, not a first miss.
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clerk,
    createdSessionId,
    getToken,
    isLoaded,
    isSignedIn,
    rotatingTokenNonce,
    sessionId,
    setActive,
    signOut,
    signUp,
  ]);

  const spinner = (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center gap-3">
        <ActivityIndicator color={colors.textPrimary} />
        <Text className="text-body text-text-secondary">Signing you in…</Text>
      </View>
    </Screen>
  );

  if (!staysOnAuthScreen(landing)) {
    return (
      <>
        <AuthLandingRedirect landing={landing} />
        {spinner}
      </>
    );
  }

  if (failed) {
    return (
      <>
        <AuthLandingRedirect landing={landing} whenSignedOut={login} />
        {spinner}
      </>
    );
  }

  return spinner;
}
