import { useAuth, useClerk, useSignIn } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { usePreventRemove } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuthDivider } from "@/components/auth/AuthDivider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { OtpCodeStep } from "@/components/auth/OtpCodeStep";
import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { SessionWait } from "@/components/SessionWait";
import { FormField } from "@/components/form/FormField";
import { PasswordField } from "@/components/form/PasswordField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import * as api from "@/lib/api";
import { shouldPreventAuthLeave } from "@/lib/authLanding";
import {
  clerkErrorMessage,
  isAlreadySignedInError,
  isStaleSignInError,
  passwordConfirmationError,
} from "@/lib/clerkAuth";
import { completeClerkAuth, withSettledClerkSession } from "@/lib/clerkComplete";
import {
  clearClerkSessionForNewAttempt,
  clerkSignOutRecoveryMessage,
  clerkSignOutRetryLabel,
  continuationAfterPassword,
  projectionForTypedEmail,
  releaseClerkSession,
  verificationCodeGate,
  type ClerkSecondFactorStrategy,
} from "@/lib/clerkSignIn";
import { clerkTokenUnavailableMessage } from "@/lib/clerkSessionBridge";
import { clientEmailUnavailableMessage } from "@/lib/copy";
import { completeGoogleSso } from "@/lib/googleSso";
import { loginVerifyCopy } from "@/lib/verifyCode";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken, sessionId } = useAuth();
  const { setActive, signOut } = useClerk();
  const sessionError = useSession((state) => state.error);
  const sessionWait = useSession((state) => state.sessionWait);
  const landing = useAuthLanding();
  const {
    step,
    code,
    secondFactor,
    /**
     * Scoped to a tap and nothing else — raised in the handler, lowered in its
     * `finally`. It is deliberately not joined to Clerk's `fetchStatus` or to
     * `session.loading`: either can hang, and a hung one used to leave Sign In
     * reading "Signing in…" with no attempt in flight to finish it. That was
     * the dead button. See the note on `busy` in `store/loginFlow.ts` for why
     * it lives in the store rather than in `useState`.
     */
    busy,
    setBusy,
    enterVerification,
    enterRecovery,
    enterNewPassword,
    setCode,
    reset: resetLoginFlow,
  } = useLoginFlow();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fast Refresh remounts this screen with empty fields while the login
    // store still thinks a code is in flight. The shop app keeps that state
    // on the component, so a remount returns to the password form. Do the
    // same here so a dead code step cannot hide Sign in / Google.
    resetLoginFlow();
    // Drop a leftover wait from Fast Refresh / a previous visit so Sign In is
    // tappable. Do not clear a Google return that is still coming back through
    // sso-callback — that is how Welcome flashed before Home.
    if (!useSession.getState().ssoInFlight) {
      useSession.getState().endClerkSync();
      if (useSession.getState().sessionWait === "in") {
        useSession.getState().clearSessionWait();
      }
    }
    return () => {
      useLoginFlow.getState().reset();
    };
  }, [resetLoginFlow]);

  // Recovery / verification stay on this screen; the platform back (header +
  // Android) would otherwise pop to welcome and lose the in-progress reset.
  // Disarm once landing is Home / complete-profile so adopt can leave.
  usePreventRemove(shouldPreventAuthLeave(landing, step !== "credentials"), () => {
    resetLoginFlow();
    setError(null);
  });

  // Home / profile / ranking leave. Signing you in does not replace this form
  // until Google (or password) has actually joined — the tap that opens the
  // account picker is not that moment.
  if (landing.kind === "signing_out") return <SessionWait tone="out" role="client" />;
  if (landing.kind !== "signed_out" && landing.kind !== "signing_in") {
    return <AuthLandingRedirect landing={landing} />;
  }
  if (sessionWait === "in" && !sessionError) {
    return <SessionWait tone="in" role="client" />;
  }

  /**
   * Clerk is still fetching the sign-in resource.
   *
   * Worth saying on the button's label, never worth disabling it for: a
   * `fetchStatus` that never settles is indistinguishable from a dead control,
   * and `signIn` being missing is now reported as an error rather than
   * swallowed by a silent `return`.
   */
  const clerkLoading = fetchStatus === "fetching";

  const adoptGridgoClient = (existingSessionId?: string | null) =>
    completeClerkAuth({
      existingSessionId,
      getToken,
      signOut,
      sessionId,
      setActive: (args) => setActive(args),
    });

  const refuseNonClientEmail = async () => {
    useSession.getState().failClerkSync(clientEmailUnavailableMessage);
    await releaseClerkSession(signOut);
  };

  const settleClerkForSignIn = async (alreadySignedIn = Boolean(isSignedIn)) => {
    // What GRIDGO already knows about the leftover, using only its live JWT.
    const typed = email.trim();
    if (alreadySignedIn && typed) {
      const leftover = await projectionForTypedEmail({
        typedEmail: typed,
        getToken,
        me: () => api.me({ ignoreUnauthorized: true }),
      });
      // A leftover on this phone may already be this email as a rider (or
      // another non-client). Refuse on the password form — never send a code.
      if (leftover === "wrong_role") {
        await refuseNonClientEmail();
        return "handled" as const;
      }
      // The leftover *is* this email, signed in as a client, right now.
      // Adopt it, the way the Google path does. Signing a good session out
      // instead buys a sign-out round trip, a fresh password attempt and a
      // new JWT mint — and leaves `getToken` answering empty in between,
      // which is exactly when "GRIDGO never received an identity token"
      // appeared. Anyone holding this phone was already signed in as this
      // person; adopting exposes nothing a launch restore would not.
      if (leftover === "same_client") {
        const adopted = await adoptGridgoClient(sessionId);
        if (adopted.kind !== "error") return "handled" as const;
        // It could not be joined after all. Fall through and sign it out so
        // the password just typed gets its own attempt, and drop the error
        // that leftover raised — this tap has not failed yet.
        useSession.getState().clearError();
      }
    }
    // Otherwise never adopt. A leftover Clerk session may belong to a
    // different person than the email just typed (or the Google account about
    // to be picked). Sign it out so this attempt is the one that lands.
    const existing = await clearClerkSessionForNewAttempt({
      isSignedIn: alreadySignedIn,
      signOut,
    });
    if (existing.status === "cleanup_failed") {
      useSession.getState().failClerkSync(existing.message);
      return "handled" as const;
    }
    return "ready" as const;
  };

  const abandonClerkSession = async () => {
    if (await releaseClerkSession(signOut)) {
      useSession.getState().clearError();
      return;
    }
    useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
  };

  /** Clerk is done; GRIDGO still has to adopt the client before Home exists. */
  const finalizeCompletedSignIn = async () => {
    if (!signIn) return;
    await completeClerkAuth({
      finalize: () => signIn.finalize(),
      getToken,
      signOut,
      setActive: (args) => setActive(args),
    });
    // Only once it is really done: a throw above must leave the code step up
    // with its error, not drop the person back on the credentials form.
    resetLoginFlow();
  };

  const sendSecondFactor = async (factor: ClerkSecondFactorStrategy) => {
    if (!signIn) return;
    if (factor === "email_code") {
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) throw sent.error;
      return;
    }
    if (factor === "phone_code") {
      const sent = await signIn.mfa.sendPhoneCode();
      if (sent.error) throw sent.error;
    }
  };

  const submitPasswordAttempt = async () => {
    if (!signIn) return;
    const result = await signIn.password({
      identifier: email.trim(),
      password,
    });
    if (result?.error) throw result.error;
  };

  const completePasswordSignIn = async (retriedExistingSession = false) => {
    if (!signIn) return;
    try {
      await submitPasswordAttempt();
    } catch (error) {
      if (!isStaleSignInError(error)) throw error;
      const created = await signIn.create({ identifier: email.trim().toLowerCase() });
      if (created?.error) throw created.error;
      await submitPasswordAttempt();
    }
    const next = continuationAfterPassword(
      signIn.status,
      signIn.supportedSecondFactors,
      signIn.existingSession,
    );
    if (next.kind === "existing_session") {
      // Clerk kept a session it already had. That leftover may not be the
      // person who just typed this password — drop it and try once more.
      if (!retriedExistingSession) {
        if (!(await releaseClerkSession(signOut))) {
          useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
          return;
        }
        await completePasswordSignIn(true);
        return;
      }
      await adoptGridgoClient(next.sessionId);
      return;
    }
    if (next.kind === "complete") {
      await finalizeCompletedSignIn();
      return;
    }
    if (next.kind === "verification") {
      const gate = await verificationCodeGate({
        typedEmail: email.trim(),
        getToken,
        me: () => api.me({ ignoreUnauthorized: true }),
        emailAvailable: api.clientEmailAvailable,
      });
      if (gate === "wrong_role") {
        await refuseNonClientEmail();
        return;
      }
      // Only show "Enter the code" after Clerk has actually sent one. A leftover
      // session that makes send fail must stay on the password form.
      await sendSecondFactor(next.factor);
      useSession.getState().clearError();
      enterVerification(next.factor);
      return;
    }
    throw new Error(next.message);
  };

  /** Clerk has not handed us a sign-in resource yet. Say so; never no-op. */
  const CLERK_NOT_READY =
    "Sign-in is still starting up. Give it a second and tap Sign In again — if it keeps saying this, check your connection.";

  const signInWithPassword = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    useSession.getState().finishSigningOut();
    useSession.getState().clearError();
    try {
      if (!signIn) {
        // Inside the busy envelope rather than an early `return` above it: a
        // silent return is a Sign In that does nothing when tapped, which is
        // exactly what a person reports as a dead button.
        setError(CLERK_NOT_READY);
        return;
      }
      await withSettledClerkSession({
        isSignedIn: Boolean(isSignedIn),
        settle: settleClerkForSignIn,
        run: completePasswordSignIn,
      });
    } catch (caught) {
      if (isAlreadySignedInError(caught)) {
        useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
        return;
      }
      if (isStaleSignInError(caught) && signIn) {
        try {
          const created = await signIn.create({ identifier: email.trim().toLowerCase() });
          if (created?.error) throw created.error;
          await completePasswordSignIn();
          return;
        } catch (retryError) {
          setError(
            clerkErrorMessage(
              retryError,
              "Could not sign in. Check your details and try again.",
            ),
          );
          return;
        }
      }
      setError(clerkErrorMessage(caught, "Could not sign in. Check your details and try again."));
    } finally {
      setBusy(false);
    }
  };

  const sendRecoveryCode = async () => {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!signIn) {
        setError(CLERK_NOT_READY);
        return;
      }
      const created = await signIn.create({ identifier: email.trim().toLowerCase() });
      if (created.error) throw created.error;
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) throw sent.error;
      enterRecovery();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "Could not send the recovery code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const verifySecondFactor = async () => {
    const current = useLoginFlow.getState();
    if (!current.code.trim()) return;
    if (!signIn) {
      setError("That sign-in expired. Go back and enter your password again.");
      resetLoginFlow();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trimmed = current.code.trim();
      const factor = current.secondFactor;
      const result =
        factor === "phone_code"
          ? await signIn.mfa.verifyPhoneCode({ code: trimmed })
          : factor === "totp"
            ? await signIn.mfa.verifyTOTP({ code: trimmed })
            : factor === "backup_code"
              ? await signIn.mfa.verifyBackupCode({ code: trimmed })
              : await signIn.mfa.verifyEmailCode({ code: trimmed });
      if (result.error) throw result.error;
      if (signIn.status !== "complete") {
        throw new Error("That code could not be verified.");
      }
      await finalizeCompletedSignIn();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  };

  const verifyRecoveryCode = async () => {
    const current = useLoginFlow.getState();
    if (!signIn || !current.code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.resetPasswordEmailCode.verifyCode({
        code: current.code.trim(),
      });
      if (result.error) throw result.error;
      enterNewPassword();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  };

  const resendVerificationCode = async () => {
    const factor = useLoginFlow.getState().secondFactor;
    setBusy(true);
    setError(null);
    try {
      await sendSecondFactor(factor);
    } catch (caught) {
      setError(clerkErrorMessage(caught, "Could not send a new code. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const submitCodeStep = () =>
    useLoginFlow.getState().step === "verifyCode"
      ? verifySecondFactor()
      : verifyRecoveryCode();

  const saveNewPassword = async () => {
    if (!signIn || !newPassword) return;
    const mismatch = passwordConfirmationError(newPassword, confirmPassword);
    if (mismatch) {
      setError(mismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });
      if (result.error) throw result.error;
      // The reset finishes the sign-in, so it lands the same way every other
      // completed flow does — adopted, not merely finalized.
      await finalizeCompletedSignIn();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "Could not save the new password."));
    } finally {
      setBusy(false);
    }
  };

  const runGoogleSso = () =>
    completeGoogleSso({
      alreadySignedIn: false,
      startSSOFlow: () => startSSOFlow({ strategy: "oauth_google" }),
      setActive: (args) => setActive(args),
    });

  const startGoogleSso = async () => {
    const outcome = await runGoogleSso();
    if (outcome.status === "activated" || outcome.status === "already_signed_in") {
      useSession.getState().beginClerkSync({ google: true });
      await adoptGridgoClient(
        outcome.status === "activated" ? outcome.sessionId : undefined,
      );
      return;
    }
    if (outcome.status === "cancelled") {
      useSession.getState().endClerkSync();
      useSession.getState().clearSsoInFlight();
    }
    // `incomplete` is the usual Android return: the custom tab closed and the
    // native `sso-callback` is about to adopt. Clearing the wait here is what
    // dumped a successful Google onto Welcome.
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    setError(null);
    useSession.getState().finishSigningOut();
    useSession.getState().clearError();
    try {
      // Same as the shop app: a live Clerk session is the person who just
      // tapped Google. Adopt it. Only start the browser flow when there is
      // no usable session — signing that leftover out first is what trapped
      // people on "Sign in again".
      if (isSignedIn) {
        // Clerk already has a session. Join it without painting wait on the
        // tap itself — syncClerkToGridgo raises the wait once the Gmail
        // session is actually being adopted.
        const leftover = await adoptGridgoClient(sessionId);
        if (leftover.kind === "adopt" || leftover.kind === "needs_profile") return;
        if (leftover.kind === "wrong_role") {
          useSession.getState().clearSsoInFlight();
          return;
        }
        if (leftover.kind === "error" && leftover.message !== clerkTokenUnavailableMessage) {
          useSession.getState().clearSsoInFlight();
          return;
        }
        useSession.getState().clearError();
        if (!(await releaseClerkSession(signOut))) {
          useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
          return;
        }
      }
      await startGoogleSso();
    } catch (caught) {
      if (isAlreadySignedInError(caught)) {
        await adoptGridgoClient(sessionId);
        return;
      }
      useSession.getState().endClerkSync();
      useSession.getState().clearSsoInFlight();
      setError(clerkErrorMessage(caught, "Google sign-in did not finish. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const signOutRetry = clerkSignOutRetryLabel(sessionError, error);
  const verifyCopy = loginVerifyCopy(secondFactor, email);
  const heading =
    step === "credentials"
      ? "Welcome Back!"
      : step === "recoveryCode"
        ? "Check your email"
        : "Choose a new password";
  const body =
    step === "credentials"
      ? "Sign in to continue managing your print jobs."
      : step === "recoveryCode"
        ? `We sent a recovery code to ${email.trim()}.`
        : "Use a strong password you have not used for GRIDGO before.";
  // A refused other-app email must not appear as "could not verify code"
  // on the next attempt's device-trust step.
  const identityRefusal =
    sessionError === clientEmailUnavailableMessage ? null : sessionError;
  const codeError = error ?? identityRefusal;

  return (
    <FormScreen
      edges={["bottom"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="gg-page gap-7 py-8">
        {step !== "verifyCode" ? (
          <View className="gap-2">
            <Text className="text-display font-black text-text-primary" accessibilityRole="header">
              {heading}
            </Text>
            <Text className="text-body-lg text-text-secondary">{body}</Text>
          </View>
        ) : null}

        {step === "verifyCode" ? (
          <OtpCodeStep
            heading={verifyCopy.heading}
            body={verifyCopy.body}
            code={code}
            onChangeCode={setCode}
            onSubmit={() => void verifySecondFactor()}
            onResend={verifyCopy.resend ? () => void resendVerificationCode() : undefined}
            busy={busy}
            submitLabel="Verify code"
            error={
              codeError ? (
                <ErrorState
                  label="Could not verify code"
                  body={codeError}
                  retryLabel={signOutRetry}
                  onRetry={signOutRetry ? () => void abandonClerkSession() : undefined}
                />
              ) : null
            }
          />
        ) : step === "credentials" ? (
          <>
            <View className="gap-4">
              <FormField label="Email">
                <TextField
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@company.com"
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
              </FormField>

              <FormField label="Password">
                <PasswordField
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  accessibilityLabel="Password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => void signInWithPassword()}
                />
              </FormField>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Recover password"
                onPress={() => void sendRecoveryCode()}
                className="gg-touch -mt-2 self-end justify-center"
              >
                <Text className="text-button text-brand">Recover password</Text>
              </Pressable>
            </View>

            {(error ?? sessionError) ? (
              <ErrorState
                label="Could not sign in"
                body={(error ?? sessionError)!}
                retryLabel={signOutRetry}
                onRetry={signOutRetry ? () => void abandonClerkSession() : undefined}
              />
            ) : null}

            {/*
              Disabled only for an empty form or a tap already in flight.
              Never for `fetchStatus`, and never for a background Clerk →
              GRIDGO sync: both can hang, and a hung one used to make this
              button permanently untappable.
            */}
            <PrimaryButton
              label={busy || clerkLoading ? "Signing in…" : "Sign In"}
              disabled={!email.trim() || !password || busy}
              onPress={() => void signInWithPassword()}
            />

            <AuthDivider />
            <GoogleButton onPress={() => void signInWithGoogle()} disabled={busy} />

            <View className="flex-row flex-wrap items-center justify-center gap-1">
              <Text className="text-body text-text-secondary">Don’t have an account?</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign up"
                onPress={() => router.push("/(auth)/signup")}
                className="gg-touch justify-center px-1"
              >
                <Text className="text-button text-brand">Sign Up</Text>
              </Pressable>
            </View>
          </>
        ) : step === "recoveryCode" ? (
          <>
            <FormField label="Recovery code">
              <TextField
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                accessibilityLabel="Recovery code"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={() => void submitCodeStep()}
              />
            </FormField>
            {codeError ? (
              <ErrorState
                label="Could not verify code"
                body={codeError}
                retryLabel={signOutRetry}
                onRetry={signOutRetry ? () => void abandonClerkSession() : undefined}
              />
            ) : null}
            <PrimaryButton
              label={busy ? "Checking…" : "Verify code"}
              disabled={code.trim().length < 6 || busy}
              onPress={() => void submitCodeStep()}
            />
          </>
        ) : (
          <>
            <View className="gap-4">
              <FormField label="New password">
                <PasswordField
                  value={newPassword}
                  onChangeText={setNewPassword}
                  accessibilityLabel="New password"
                  textContentType="newPassword"
                />
              </FormField>
              <FormField label="Confirm password">
                <PasswordField
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  accessibilityLabel="Confirm new password"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={() => void saveNewPassword()}
                />
              </FormField>
            </View>
            {error ? <ErrorState label="Could not reset password" body={error} /> : null}
            <PrimaryButton
              label={busy ? "Saving…" : "Save password"}
              disabled={!newPassword || !confirmPassword || busy}
              onPress={() => void saveNewPassword()}
            />
          </>
        )}
      </View>
    </FormScreen>
  );
}
