import { useSignIn } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { Redirect, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { PasswordField } from "@/components/form/PasswordField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
import { clerkErrorMessage, passwordConfirmationError } from "@/lib/clerkAuth";
import { useSession } from "@/store/session";

type Step = "credentials" | "recoveryCode" | "newPassword";

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { user, login, loading: localLoading, error: sessionError } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<Step>("credentials");
  const [error, setError] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  if (user) return <Redirect href="/(tabs)/home" />;

  const clerkLoading = fetchStatus === "fetching";
  const busy = clerkLoading || socialLoading || localLoading;

  const goBack = () => {
    if (step !== "credentials") {
      setStep("credentials");
      setError(null);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/(auth)/welcome" as Href);
  };

  const signInWithPassword = async () => {
    if (!signIn || !email.trim() || !password) return;
    setError(null);
    try {
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
    } catch (caught) {
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

  const signInWithGoogle = async () => {
    setSocialLoading(true);
    setError(null);
    try {
      await startSSOFlow({ strategy: "oauth_google" });
    } catch (caught) {
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
      edges={["top", "bottom"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="gg-page gap-7 py-8">
        <AuthBackButton onPress={goBack} />

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
              <ErrorState label="Could not sign in" body={(error ?? sessionError)!} />
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

            <PushEnableCard />
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
