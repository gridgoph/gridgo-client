import { useAuth, useClerk, useSignIn } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { usePreventRemove } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuthDivider } from "@/components/auth/AuthDivider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { OtpCodeStep } from "@/components/auth/OtpCodeStep";
import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { PasswordField } from "@/components/form/PasswordField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { shouldPreventAuthLeave, staysOnAuthScreen } from "@/lib/authLanding";
import { loginVerifyCopy } from "@/lib/verifyCode";
import { clerkErrorMessage, isAlreadySignedInError, passwordConfirmationError } from "@/lib/clerkAuth";
import { completeClerkAuth, withSettledClerkSession } from "@/lib/clerkComplete";
import {
  clearClerkSessionForNewAttempt,
  clerkSignOutRecoveryMessage,
  continuationAfterPassword,
  releaseClerkSession,
  type ClerkSecondFactorStrategy,
} from "@/lib/clerkSignIn";
import { completeGoogleSso } from "@/lib/googleSso";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken, sessionId } = useAuth();
  const { setActive, signOut } = useClerk();
  const login = useSession((state) => state.login);
  const localLoading = useSession((state) => state.loading);
  const sessionError = useSession((state) => state.error);
  const landing = useAuthLanding();
  const {
    step,
    code,
    secondFactor,
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
  const [socialLoading, setSocialLoading] = useState(false);

  useEffect(() => {
    return () => {
      useLoginFlow.getState().reset();
    };
  }, []);

  // Recovery / verification stay on this screen; the platform back (header +
  // Android) would otherwise pop to welcome and lose the in-progress reset.
  // Disarm once landing is Home / complete-profile so adopt can leave.
  usePreventRemove(shouldPreventAuthLeave(landing, step !== "credentials"), () => {
    resetLoginFlow();
    setError(null);
  });

  if (!staysOnAuthScreen(landing)) return <AuthLandingRedirect landing={landing} />;

  const clerkLoading = fetchStatus === "fetching";
  const busy = clerkLoading || socialLoading || localLoading;

  const adoptGridgoClient = (existingSessionId?: string | null) =>
    completeClerkAuth({
      existingSessionId,
      getToken,
      signOut,
      sessionId,
      setActive: (args) => setActive(args),
    });

  const settleClerkForSignIn = async (alreadySignedIn = Boolean(isSignedIn)) => {
    // Never adopt here. A leftover Clerk session may belong to a different
    // person than the email just typed (or the Google account about to be
    // picked). Sign it out so this attempt is the one that lands.
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

  const completePasswordSignIn = async (retriedExistingSession = false) => {
    if (!signIn) return;
    const result = await signIn.password({
      emailAddress: email.trim().toLowerCase(),
      password,
    });
    if (result?.error) throw result.error;
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
      enterVerification(next.factor);
      await sendSecondFactor(next.factor);
      return;
    }
    throw new Error(next.message);
  };

  const signInWithPassword = async () => {
    if (!signIn || !email.trim() || !password) return;
    setError(null);
    try {
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
      setError(clerkErrorMessage(caught, "Could not sign in. Check your details and try again."));
    }
  };

  const sendRecoveryCode = async () => {
    if (!signIn || !email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setError(null);
    try {
      const created = await signIn.create({ identifier: email.trim().toLowerCase() });
      if (created.error) throw created.error;
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) throw sent.error;
      enterRecovery();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "Could not send the recovery code. Try again."));
    }
  };

  const verifySecondFactor = async () => {
    const current = useLoginFlow.getState();
    if (!signIn || !current.code.trim()) return;
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
    }
  };

  const verifyRecoveryCode = async () => {
    const current = useLoginFlow.getState();
    if (!signIn || !current.code.trim()) return;
    setError(null);
    try {
      const result = await signIn.resetPasswordEmailCode.verifyCode({
        code: current.code.trim(),
      });
      if (result.error) throw result.error;
      enterNewPassword();
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That code could not be verified."));
    }
  };

  const resendVerificationCode = async () => {
    const factor = useLoginFlow.getState().secondFactor;
    setError(null);
    try {
      await sendSecondFactor(factor);
    } catch (caught) {
      setError(clerkErrorMessage(caught, "Could not send a new code. Try again."));
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
    }
  };

  const runGoogleSso = () =>
    completeGoogleSso({
      alreadySignedIn: false,
      startSSOFlow: () => startSSOFlow({ strategy: "oauth_google" }),
      setActive: (args) => setActive(args),
    });

  const signInWithGoogle = async () => {
    setSocialLoading(true);
    setError(null);
    try {
      await withSettledClerkSession({
        isSignedIn: Boolean(isSignedIn),
        settle: settleClerkForSignIn,
        run: async () => {
          const outcome = await runGoogleSso();
          // Google's session is activated but not yet a GRIDGO client; the
          // adopt is what puts a user in the store and leaves this screen.
          if (outcome.status === "activated" || outcome.status === "already_signed_in") {
            await adoptGridgoClient(
              outcome.status === "activated" ? outcome.sessionId : undefined,
            );
            return;
          }
          if (outcome.status === "incomplete") {
            setError("Google sign-in did not finish. Try again.");
          }
        },
      });
    } catch (caught) {
      if (isAlreadySignedInError(caught)) {
        useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
        return;
      }
      setError(clerkErrorMessage(caught, "Google sign-in did not finish. Try again."));
    } finally {
      setSocialLoading(false);
    }
  };

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
  const codeError = error ?? sessionError;

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
                  retryLabel={sessionError && !error ? "Sign out and try again" : undefined}
                  onRetry={sessionError && !error ? () => void abandonClerkSession() : undefined}
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
                retryLabel={sessionError && !error ? "Sign out and try again" : undefined}
                onRetry={sessionError && !error ? () => void abandonClerkSession() : undefined}
              />
            ) : null}

            <PrimaryButton
              label={busy ? "Signing in…" : "Sign In"}
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

            {__DEV__ ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use local API instead"
                disabled={!email.trim() || !password || busy}
                onPress={() => void login(email.trim(), password)}
                className="gg-touch items-center justify-center"
              >
                <Text className="text-caption text-text-muted">Use local API instead</Text>
              </Pressable>
            ) : null}
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
                retryLabel={sessionError && !error ? "Sign out and try again" : undefined}
                onRetry={sessionError && !error ? () => void abandonClerkSession() : undefined}
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
              label={clerkLoading ? "Saving…" : "Save password"}
              disabled={!newPassword || !confirmPassword || clerkLoading}
              onPress={() => void saveNewPassword()}
            />
          </>
        )}
      </View>
    </FormScreen>
  );
}
