import { useAuth, useClerk, useSignIn } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { usePreventRemove } from "@react-navigation/native";
import { Redirect, type Href, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuthDivider } from "@/components/auth/AuthDivider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { PasswordField } from "@/components/form/PasswordField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { clerkErrorMessage, isAlreadySignedInError, passwordConfirmationError } from "@/lib/clerkAuth";
import { syncClerkToGridgo } from "@/lib/clerkGridgoSync";
import { adoptOrClearClerkSession } from "@/lib/clerkSignIn";
import { completeGoogleSso } from "@/lib/googleSso";
import { needsClientProfile } from "@/lib/signup";
import { useSession } from "@/store/session";

type Step = "credentials" | "recoveryCode" | "newPassword";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { isSignedIn, getToken, sessionId } = useAuth();
  const { setActive, signOut } = useClerk();
  const {
    user,
    login,
    loading: localLoading,
    error: sessionError,
    pendingClerkProfile,
    justProvisioned,
  } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<Step>("credentials");
  const [error, setError] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  // Recovery steps stay on this screen; the platform back (header + Android)
  // would otherwise pop to welcome and lose the in-progress reset.
  usePreventRemove(step !== "credentials", () => {
    setStep("credentials");
    setError(null);
  });

  if (user && needsClientProfile(user)) return <Redirect href={"/complete-profile" as Href} />;
  if (!user && pendingClerkProfile) return <Redirect href={"/complete-profile" as Href} />;
  if (user && justProvisioned) {
    return <Redirect href={{ pathname: "/onboarding", params: { returnTo: "home" } }} />;
  }
  if (user) return <Redirect href="/(tabs)/home" />;

  const clerkLoading = fetchStatus === "fetching";
  const busy = clerkLoading || socialLoading || localLoading;

  const settleExistingClerkSession = (alreadySignedIn = Boolean(isSignedIn)) =>
    adoptOrClearClerkSession({
      isSignedIn: alreadySignedIn,
      sessionId,
      getToken,
      setActive: (args) => setActive(args),
      signOut,
    });

  const adoptGridgoClient = async () => {
    await syncClerkToGridgo({ getToken, signOut });
  };

  const abandonClerkSession = async () => {
    try {
      await signOut();
      useSession.getState().clearError();
    } catch {
      useSession
        .getState()
        .failClerkSync("GRIDGO could not sign you out of Clerk. Check your connection and try again.");
    }
  };

  const completePasswordSignIn = async () => {
    if (!signIn) return;
    const result = await signIn.password({
      emailAddress: email.trim().toLowerCase(),
      password,
    });
    if (result.error) throw result.error;
    if (signIn.status !== "complete") {
      throw new Error("This account needs another verification step. Please try again.");
    }
    const finalized = await signIn.finalize();
    if (finalized.error) throw finalized.error;
  };

  const signInWithPassword = async () => {
    if (!signIn || !email.trim() || !password) return;
    setError(null);
    try {
      const existing = await settleExistingClerkSession();
      if (existing.status === "adopt") {
        await adoptGridgoClient();
        return;
      }
      await completePasswordSignIn();
    } catch (caught) {
      if (isAlreadySignedInError(caught)) {
        try {
          const existing = await settleExistingClerkSession(true);
          if (existing.status === "adopt") {
            await adoptGridgoClient();
            return;
          }
          await completePasswordSignIn();
          return;
        } catch (retryCaught) {
          setError(
            clerkErrorMessage(retryCaught, "Could not sign in. Check your details and try again."),
          );
          return;
        }
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
      setStep("recoveryCode");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "Could not send the recovery code. Try again."));
    }
  };

  const verifyRecoveryCode = async () => {
    if (!signIn || !code.trim()) return;
    setError(null);
    try {
      const result = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (result.error) throw result.error;
      setStep("newPassword");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That code could not be verified."));
    }
  };

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
      const finalized = await signIn.finalize();
      if (finalized.error) throw finalized.error;
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
      const existing = await settleExistingClerkSession();
      if (existing.status === "adopt") {
        await adoptGridgoClient();
        return;
      }
      const outcome = await runGoogleSso();
      if (outcome.status === "already_signed_in") {
        await adoptGridgoClient();
        return;
      }
      if (outcome.status === "incomplete") {
        setError("Google sign-in did not finish. Try again.");
      }
    } catch (caught) {
      if (isAlreadySignedInError(caught)) {
        try {
          const existing = await settleExistingClerkSession(true);
          if (existing.status === "adopt") {
            await adoptGridgoClient();
            return;
          }
          const outcome = await runGoogleSso();
          if (outcome.status === "incomplete") {
            setError("Google sign-in did not finish. Try again.");
          }
          return;
        } catch (retryCaught) {
          setError(clerkErrorMessage(retryCaught, "Google sign-in did not finish. Try again."));
          return;
        }
      }
      setError(clerkErrorMessage(caught, "Google sign-in did not finish. Try again."));
    } finally {
      setSocialLoading(false);
    }
  };

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
        ? `We sent a six-digit code to ${email.trim()}.`
        : "Use a strong password you have not used for GRIDGO before.";

  return (
    <FormScreen
      edges={["bottom"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="gg-page gap-7 py-8">
        <View className="gap-2">
          <Text className="text-display font-black text-text-primary" accessibilityRole="header">
            {heading}
          </Text>
          <Text className="text-body-lg text-text-secondary">{body}</Text>
        </View>

        {step === "credentials" ? (
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
                onSubmitEditing={() => void verifyRecoveryCode()}
              />
            </FormField>
            {error ? <ErrorState label="Could not verify code" body={error} /> : null}
            <PrimaryButton
              label={clerkLoading ? "Checking…" : "Verify code"}
              disabled={code.trim().length < 6 || clerkLoading}
              onPress={() => void verifyRecoveryCode()}
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
