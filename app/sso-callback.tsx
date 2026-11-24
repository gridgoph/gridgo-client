import { useAuth, useClerk, useSignUp } from "@clerk/expo";
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { SessionWait } from "@/components/SessionWait";
import { staysOnAuthScreen } from "@/lib/authLanding";
import { completeClerkAuth } from "@/lib/clerkComplete";
import { CLERK_SSO_TOKEN_WAIT } from "@/lib/clerkSignIn";
import { clientEmailUnavailableMessage } from "@/lib/copy";
import {
  adoptGoogleSsoClient,
  createdSessionIdFromSsoReload,
  finishGoogleSsoReturn,
  googleSsoCreatedSessionId,
  googleSsoRotatingTokenNonce,
  reloadClerkSignInForSso,
} from "@/lib/googleSso";
import {
  signInNeedsLinkCode,
  signUpNeedsContact,
  type SsoFutureSignIn,
} from "@/lib/socialSignIn";
import { useSession } from "@/store/session";
import { useSocialFinish } from "@/store/socialFinish";

const login = "/(auth)/login" as Href;
const finishSignIn = "/(auth)/finish-sign-in" as Href;

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
  const sessionError = useSession((state) => state.error);
  const attempted = useRef(false);
  const [failed, setFailed] = useState(false);
  const [needsFinish, setNeedsFinish] = useState(false);
  const clerkRef = useRef(clerk);
  const getTokenRef = useRef(getToken);
  const setActiveRef = useRef(setActive);
  const signOutRef = useRef(signOut);
  const signUpRef = useRef(signUp);
  useEffect(() => {
    clerkRef.current = clerk;
    getTokenRef.current = getToken;
    setActiveRef.current = setActive;
    signOutRef.current = signOut;
    signUpRef.current = signUp;
  });

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
    useSession.getState().beginClerkSync({ google: true });

    let cancelled = false;
    void (async () => {
      try {
        let sessionFromNonce: string | null = null;
        if (!isSignedIn && !createdSessionId && rotatingTokenNonce) {
          const reloaded = await reloadClerkSignInForSso(clerkRef.current, rotatingTokenNonce);
          sessionFromNonce = await createdSessionIdFromSsoReload(reloaded, async () => {
            const currentSignUp = signUpRef.current;
            if (!currentSignUp) return null;
            const transferred = await currentSignUp.create({ transfer: true });
            if (
              transferred &&
              typeof transferred === "object" &&
              "error" in transferred &&
              transferred.error
            ) {
              throw transferred.error;
            }
            return currentSignUp;
          });
        }

        const outcome = await finishGoogleSsoReturn({
          alreadySignedIn: Boolean(isSignedIn),
          createdSessionId: createdSessionId ?? sessionFromNonce,
          setActive: (args) => setActiveRef.current(args),
        });
        if (cancelled) return;

        if (outcome.status !== "activated" && outcome.status !== "already_signed_in") {
          // A Facebook account with no email (or one Clerk wants confirmed
          // before linking) has nothing to activate yet: it finishes on its
          // own step, not on this wait.
          const signIn = (clerkRef.current as { client?: { signIn?: SsoFutureSignIn } }).client
            ?.signIn;
          if (signUpNeedsContact(signUpRef.current) || signInNeedsLinkCode(signIn)) {
            useSession.getState().endClerkSync();
            useSession.getState().clearSsoInFlight();
            useSocialFinish.getState().reset();
            setNeedsFinish(true);
            return;
          }
          // Login's startSSOFlow may still be activating. Wait for isSignedIn.
          // Keep the Google wait — clearing it here dumps onto Welcome.
          attempted.current = false;
          return;
        }

        const result = await adoptGoogleSsoClient({
          cancelled: () => cancelled,
          adopt: () =>
            completeClerkAuth({
              existingSessionId:
                outcome.status === "activated" ? outcome.sessionId : sessionId,
              getToken: getTokenRef.current,
              signOut: signOutRef.current,
              sessionId,
              setActive: (args) => setActiveRef.current(args),
              tokenWait: CLERK_SSO_TOKEN_WAIT,
            }),
        });
        if (cancelled) return;
        if (result.kind === "wrong_role") {
          if (!useSession.getState().error) {
            useSession.getState().failClerkSync(clientEmailUnavailableMessage);
          } else {
            useSession.getState().endClerkSync();
            useSession.getState().clearSsoInFlight();
          }
          setFailed(true);
          return;
        }
        if (result.kind === "error") {
          // Retries spent and still no client — confirmed dead, not a first miss.
          useSession.getState().endClerkSync();
          useSession.getState().clearSsoInFlight();
          setFailed(true);
        }
      } catch {
        if (!cancelled) {
          useSession.getState().endClerkSync();
          useSession.getState().clearSsoInFlight();
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createdSessionId, isLoaded, isSignedIn, rotatingTokenNonce, sessionId]);

  // A refused Google account (rider, shop, ops) must reach login even if
  // Clerk is still signed in. failClerkSync can land before this screen
  // sets `failed`, and staying on the wait is the stuck "Taking your seat."
  if (needsFinish) return <Redirect href={finishSignIn} />;

  if (failed || sessionError) {
    return <AuthLandingRedirect landing={{ kind: "signed_out" }} whenSignedOut={login} />;
  }

  if (!staysOnAuthScreen(landing)) {
    return <AuthLandingRedirect landing={landing} />;
  }

  return <SessionWait tone="in" role="client" />;
}
