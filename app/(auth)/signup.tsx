import { useSignUp } from "@clerk/expo";
import { usePreventRemove } from "@react-navigation/native";
import { Redirect, type Href } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { PasswordField } from "@/components/form/PasswordField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import {
  clerkErrorMessage,
  passwordConfirmationError,
  splitFullName,
} from "@/lib/clerkAuth";
import { needsClientProfile } from "@/lib/signup";
import { useSession } from "@/store/session";

export default function SignupScreen() {
  const { signUp, fetchStatus } = useSignUp();
  const user = useSession((state) => state.user);
  const pendingClerkProfile = useSession((state) => state.pendingClerkProfile);
  const justProvisioned = useSession((state) => state.justProvisioned);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verification stays on this screen; the platform back would otherwise
  // pop to welcome and lose the in-progress sign-up.
  usePreventRemove(verifying, () => {
    setVerifying(false);
    setError(null);
  });

  if (user && needsClientProfile(user)) return <Redirect href={"/complete-profile" as Href} />;
  if (!user && pendingClerkProfile) return <Redirect href={"/complete-profile" as Href} />;
  if (user && justProvisioned) {
    return <Redirect href={{ pathname: "/onboarding", params: { returnTo: "home" } }} />;
  }
  if (user) return <Redirect href="/(tabs)/home" />;

  const busy = fetchStatus === "fetching";

  const createAccount = async () => {
    if (!signUp || !fullName.trim() || !email.trim() || !password) return;
    const mismatch = passwordConfirmationError(password, confirmPassword);
    if (mismatch) {
      setError(mismatch);
      return;
    }

    setError(null);
    try {
      const name = splitFullName(fullName);
      const result = await signUp.password({
        emailAddress: email.trim().toLowerCase(),
        password,
        ...name,
      });
      if (result.error) throw result.error;

      if (signUp.status === "complete") {
        const finalized = await signUp.finalize();
        if (finalized.error) throw finalized.error;
        return;
      }

      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setVerifying(true);
    } catch (caught) {
      setError(
        clerkErrorMessage(caught, "Could not create your account. Check your details and try again."),
      );
    }
  };

  const verifyEmail = async () => {
    if (!signUp || code.trim().length < 6) return;
    setError(null);
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (result.error) throw result.error;
      if (signUp.status !== "complete") {
        throw new Error("Your email is verified, but the account still needs attention.");
      }
      const finalized = await signUp.finalize();
      if (finalized.error) throw finalized.error;
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That code could not be verified."));
    }
  };

  return (
    <FormScreen
      edges={["bottom"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="gg-page gap-7 py-8">
        <View className="gap-2">
          <Text className="text-display font-black text-text-primary" accessibilityRole="header">
            {verifying ? "Verify your email" : "Create Account"}
          </Text>
          <Text className="text-body-lg text-text-secondary">
            {verifying
              ? `Enter the six-digit code sent to ${email.trim()}.`
              : "Your GRIDGO client account starts here."}
          </Text>
        </View>

        {verifying ? (
          <>
            <FormField label="Verification code">
              <TextField
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                accessibilityLabel="Verification code"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="go"
                onSubmitEditing={() => void verifyEmail()}
              />
            </FormField>
            {error ? <ErrorState label="Could not verify email" body={error} /> : null}
            <PrimaryButton
              label={busy ? "Checking…" : "Verify email"}
              disabled={code.trim().length < 6 || busy}
              onPress={() => void verifyEmail()}
            />
          </>
        ) : (
          <>
            <View className="gap-4">
              <FormField label="Full name">
                <TextField
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Ana Santos"
                  accessibilityLabel="Full name"
                  autoCapitalize="words"
                  textContentType="name"
                  returnKeyType="next"
                  maxLength={80}
                />
              </FormField>

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
                  maxLength={120}
                />
              </FormField>

              <FormField label="Password" helper="Use at least 15 characters.">
                <PasswordField
                  value={password}
                  onChangeText={setPassword}
                  accessibilityLabel="Password"
                  textContentType="newPassword"
                  returnKeyType="next"
                />
              </FormField>

              <FormField label="Confirm password">
                <PasswordField
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  accessibilityLabel="Confirm password"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={() => void createAccount()}
                />
              </FormField>
            </View>

            {/* Clerk's smart bot protection mounts its challenge here only when needed. */}
            <View nativeID="clerk-captcha" />

            {error ? <ErrorState label="Could not create account" body={error} /> : null}

            <PrimaryButton
              label={busy ? "Creating account…" : "Sign Up"}
              disabled={
                !fullName.trim() ||
                !email.trim() ||
                !password ||
                !confirmPassword ||
                busy
              }
              onPress={() => void createAccount()}
            />

            <Text className="text-center text-caption text-text-muted">
              Suppliers, riders, and Operations use their own GRIDGO app.
            </Text>
          </>
        )}
      </View>
    </FormScreen>
  );
}
