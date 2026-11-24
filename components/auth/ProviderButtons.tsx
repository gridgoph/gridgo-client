import { useAuth, useClerk } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { useRouter, type Href } from "expo-router";
import { Info } from "lucide-react-native";
import { Text, View } from "react-native";

import { AppleButton } from "@/components/auth/AppleButton";
import { FacebookButton } from "@/components/auth/FacebookButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { ErrorState } from "@/components/ErrorState";
import { useThemeColors } from "@/hooks/useTheme";
import { appleSignInOutcome, isAppleCancel, type AppleFlowResult } from "@/lib/appleSignIn";
import { clerkErrorMessage, isAlreadySignedInError } from "@/lib/clerkAuth";
import { completeClerkAuth } from "@/lib/clerkComplete";
import { clerkSignOutRecoveryMessage, releaseClerkSession } from "@/lib/clerkSignIn";
import { clerkTokenUnavailableMessage } from "@/lib/clerkSessionBridge";
import { completeGoogleSso } from "@/lib/googleSso";
import {
  FACEBOOK_CANCELLED,
  FACEBOOK_DID_NOT_FINISH,
  FACEBOOK_STRATEGY,
  FACEBOOK_UNAVAILABLE,
  isFacebookUnavailableError,
  socialSsoOutcome,
  type SocialSsoResult,
} from "@/lib/socialSignIn";
import { useSession } from "@/store/session";
import { useSocialFinish } from "@/store/socialFinish";

const finishSignIn = "/(auth)/finish-sign-in" as Href;

type Props = {
  /** Draw "Continue with Facebook" (Clerk offers it — `useFacebookOffered`). */
  facebook: boolean;
  /** Something else on the screen is in flight. */
  disabled?: boolean;
  /** Lets the screen disable its own form while a provider tap runs. */
  onBusyChange?: (busy: boolean) => void;
  /** A provider tap started: the screen drops its own stale error. */
  onStart?: () => void;
};

/**
 * One tap to sign in or sign up with another account: Facebook, then Google,
 * then Apple (iPhone only — Apple requires it wherever other social sign-ins
 * are offered, at the same size as the others). Before Clerk offers Facebook
 * the block is Apple then Google, as it always was. Login and sign-up draw the same block, so a person who picks
 * either door gets the same choices and the same outcome: a new person lands
 * on Finish signing up, an existing one lands in their own account.
 *
 * Each finished flow joins GRIDGO through `completeClerkAuth`, exactly as the
 * password form does; this component owns only what happens around the
 * provider's own window.
 */
export function ProviderButtons({ facebook, disabled, onBusyChange, onStart }: Props) {
  const router = useRouter();
  const colors = useThemeColors();
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken, sessionId } = useAuth();
  const { setActive, signOut } = useClerk();
  const busy = useSocialFinish((state) => state.providerBusy);
  const error = useSocialFinish((state) => state.providerError);
  const notice = useSocialFinish((state) => state.notice);

  const adoptGridgoClient = (existingSessionId?: string | null) =>
    completeClerkAuth({
      existingSessionId,
      getToken,
      signOut,
      sessionId,
      setActive: (args) => setActive(args),
    });

  /**
   * A live Clerk session when a provider is tapped.
   *
   * Same as the shop app: a live Clerk session is the person who just tapped.
   * Adopt it. Only start the provider's flow when there is no usable session —
   * signing that leftover out first is what trapped people on "Sign in again".
   * True when the leftover was dealt with and the tap is over.
   */
  const settleLeftoverForProvider = async () => {
    if (!isSignedIn) return false;
    const leftover = await adoptGridgoClient(sessionId);
    if (leftover.kind === "adopt" || leftover.kind === "needs_profile") return true;
    if (leftover.kind === "wrong_role") {
      useSession.getState().clearSsoInFlight();
      return true;
    }
    if (leftover.kind === "error" && leftover.message !== clerkTokenUnavailableMessage) {
      useSession.getState().clearSsoInFlight();
      return true;
    }
    useSession.getState().clearError();
    if (!(await releaseClerkSession(signOut))) {
      useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
      return true;
    }
    return false;
  };

  /** The envelope every provider tap runs in: busy raised here, lowered in `finally`. */
  const runTap = async (
    tap: () => Promise<void>,
    onError: (caught: unknown) => Promise<void> | void,
  ) => {
    const state = useSocialFinish.getState();
    state.setProviderBusy(true);
    state.setProviderError(null);
    state.setNotice(null);
    onBusyChange?.(true);
    onStart?.();
    useSession.getState().finishSigningOut();
    useSession.getState().clearError();
    try {
      if (await settleLeftoverForProvider()) return;
      await tap();
    } catch (caught) {
      if (isAlreadySignedInError(caught)) {
        await adoptGridgoClient(sessionId);
        return;
      }
      await onError(caught);
    } finally {
      useSocialFinish.getState().setProviderBusy(false);
      onBusyChange?.(false);
    }
  };

  const stopSsoWait = () => {
    useSession.getState().endClerkSync();
    useSession.getState().clearSsoInFlight();
  };

  const signInWithFacebook = () =>
    runTap(
      async () => {
        const result = (await startSSOFlow({ strategy: FACEBOOK_STRATEGY })) as SocialSsoResult;
        const outcome = socialSsoOutcome(result);
        if (outcome.status === "activated") {
          useSession.getState().beginClerkSync({ google: true });
          await adoptGridgoClient(outcome.sessionId);
          return;
        }
        if (outcome.status === "cancelled") {
          stopSsoWait();
          useSocialFinish.getState().setNotice(FACEBOOK_CANCELLED);
          return;
        }
        if (outcome.status === "needs_contact" || outcome.status === "needs_link_code") {
          stopSsoWait();
          useSocialFinish.getState().reset();
          router.push(finishSignIn);
        }
        // `incomplete` is the Android return: the custom tab closed and the
        // native `sso-callback` route finishes it, exactly as for Google.
      },
      (caught) => {
        stopSsoWait();
        useSocialFinish
          .getState()
          .setProviderError(
            isFacebookUnavailableError(caught)
              ? FACEBOOK_UNAVAILABLE
              : clerkErrorMessage(caught, FACEBOOK_DID_NOT_FINISH),
          );
      },
    );

  const signInWithGoogle = () =>
    runTap(
      async () => {
        const outcome = await completeGoogleSso({
          alreadySignedIn: false,
          startSSOFlow: () => startSSOFlow({ strategy: "oauth_google" }),
          setActive: (args) => setActive(args),
        });
        if (outcome.status === "activated" || outcome.status === "already_signed_in") {
          useSession.getState().beginClerkSync({ google: true });
          await adoptGridgoClient(
            outcome.status === "activated" ? outcome.sessionId : undefined,
          );
          return;
        }
        if (outcome.status === "cancelled") stopSsoWait();
        // `incomplete` is the usual Android return: the custom tab closed and
        // the native `sso-callback` is about to adopt. Clearing the wait here
        // is what dumped a successful Google onto Welcome.
      },
      (caught) => {
        stopSsoWait();
        useSocialFinish
          .getState()
          .setProviderError(clerkErrorMessage(caught, "Google sign-in did not finish. Try again."));
      },
    );

  /**
   * Sign in with Apple (iPhone only). Apple's sheet is native, so unlike
   * Google there is no browser return to wait for: the flow either hands back
   * a session, which lands through `completeClerkAuth` like every other
   * finished Clerk flow, or the person closed the sheet and nothing is said.
   */
  const signInWithApple = (start: () => Promise<AppleFlowResult>) =>
    runTap(
      async () => {
        try {
          const outcome = appleSignInOutcome(await start());
          if (outcome.status === "activated") {
            useSession.getState().beginClerkSync();
            await adoptGridgoClient(outcome.sessionId);
            return;
          }
          if (outcome.status === "incomplete") {
            useSocialFinish.getState().setProviderError(outcome.message);
          }
        } catch (caught) {
          if (isAppleCancel(caught)) return;
          throw caught;
        }
      },
      (caught) => {
        useSession.getState().endClerkSync();
        useSocialFinish
          .getState()
          .setProviderError(clerkErrorMessage(caught, "Apple sign-in did not finish. Try again."));
      },
    );

  const off = Boolean(disabled) || busy;

  return (
    <View className="gap-3">
      {notice ? (
        <View
          className="flex-row gap-3 rounded-card bg-surface-variant p-4"
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={notice}
        >
          <Info size={18} color={colors.textSecondary} strokeWidth={2} />
          <Text className="min-w-0 flex-1 text-body text-text-secondary">{notice}</Text>
        </View>
      ) : null}
      {error ? <ErrorState label="Could not sign in" body={error} /> : null}
      {facebook ? (
        <>
          <FacebookButton onPress={() => void signInWithFacebook()} disabled={off} />
          <GoogleButton onPress={() => void signInWithGoogle()} disabled={off} />
          <AppleButton onPress={(start) => void signInWithApple(start)} disabled={off} />
        </>
      ) : (
        // Until Clerk offers Facebook the order stays what it has always been.
        <>
          <AppleButton onPress={(start) => void signInWithApple(start)} disabled={off} />
          <GoogleButton onPress={() => void signInWithGoogle()} disabled={off} />
        </>
      )}
    </View>
  );
}
