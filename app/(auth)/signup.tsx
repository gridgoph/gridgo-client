import { useAuth, useClerk, useSignUp } from "@clerk/expo";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { OtpCodeStep } from "@/components/auth/OtpCodeStep";
import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { PasswordField } from "@/components/form/PasswordField";
import { TextField } from "@/components/form/TextField";
import { SignupConsentFields } from "@/components/legal/SignupConsentFields";
import { PrimaryButton } from "@/components/PrimaryButton";
import { shouldPreventAuthLeave, staysOnAuthScreen } from "@/lib/authLanding";
import { signupVerifyCopy } from "@/lib/verifyCode";
import {
  clerkErrorMessage,
  isAlreadySignedInError,
  passwordConfirmationError,
  splitFullName,
} from "@/lib/clerkAuth";
import { completeClerkAuth, withSettledClerkSession } from "@/lib/clerkComplete";
import {
  clearClerkSessionForNewAttempt,
  clerkSignOutRecoveryMessage,
  clerkSignOutRetryLabel,
  releaseClerkSession,
} from "@/lib/clerkSignIn";
import { continuationAfterSignUp } from "@/lib/clerkSignUp";
import { enrollmentConsentBody, signupConsentProblem, signupDocuments } from "@/lib/legal";
import { legalContext } from "@/lib/legalContext";
import { useEnrollmentConsent } from "@/store/enrollmentConsent";
import { useLegalLibrary } from "@/store/legalLibrary";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";

export default function SignupScreen() {
  const { signUp, fetchStatus } = useSignUp();
  const { isSignedIn, getToken } = useAuth();
  const { setActive, signOut } = useClerk();
  const landing = useAuthLanding();
  const sessionError = useSession((state) => state.error);
  const adoptLoading = useSession((state) => state.loading);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const libraryStatus = useLegalLibrary((state) => state.status);
  const documents = signupDocuments(useLegalLibrary((state) => state.documents));
  const {
    step,
    code,
    consent,
    setConsent,
    enterEmailCode,
    setCode,
    reset: resetSignupFlow,
  } = useSignupFlow();
  const verifying = step === "emailCode";

  useEffect(() => {
    void useLegalLibrary.getState().load();
    return () => {
      useSignupFlow.getState().reset();
      // The boxes belonged to this form. A later Google sign-in on this phone
      // agrees for itself on Finish signing up.
      useEnrollmentConsent.getState().clear();
    };
  }, []);

  // Verification stays on this screen; the platform back would otherwise
  // pop to welcome and lose the in-progress sign-up.
  // Disarm once landing is Home / complete-profile so adopt can leave.
  usePreventRemove(shouldPreventAuthLeave(landing, verifying), () => {
    resetSignupFlow();
    setError(null);
  });

  if (!staysOnAuthScreen(landing)) return <AuthLandingRedirect landing={landing} />;

  const busy = fetchStatus === "fetching" || adoptLoading;
  // Versions to name, or an API with no legal library at all.
  const consentReady = Boolean(documents) || libraryStatus === "unsupported";
  const consentProblem = signupConsentProblem(consent);
  const verifyCopy = signupVerifyCopy(email);
  const signOutRetry = clerkSignOutRetryLabel(sessionError, error);

  const settleClerkForSignUp = async (alreadySignedIn: boolean) => {
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

  /**
   * Every Clerk sign-up outcome, in one place. Both the password step and the
   * emailed code end here so that `complete` always adopts the GRIDGO client —
   * finalizing alone leaves `user` null and the form on screen.
   */
  const continueSignUp = async (options?: { allowEmailCode?: boolean }) => {
    if (!signUp) return;
    const next = continuationAfterSignUp({
      status: signUp.status,
      unverifiedFields: signUp.unverifiedFields,
      missingFields: signUp.missingFields,
      existingSession: signUp.existingSession,
    });

    if (next.kind === "existing_session") {
      // Same trap as login: Clerk kept a leftover rather than creating this
      // account. Drop it so the details just typed can start a real sign-up.
      if (!(await releaseClerkSession(signOut))) {
        useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
        return;
      }
      throw new Error("You're currently logged in.");
    }
    if (next.kind === "complete") {
      await completeClerkAuth({
        finalize: () => signUp.finalize(),
        getToken,
        signOut,
        setActive: (args) => setActive(args),
      });
      return;
    }
    if (next.kind === "email_code") {
      // Never straight after a verified code: that would mail a second one and
      // leave the person retyping into the same screen forever.
      if (options?.allowEmailCode === false) {
        throw new Error("Your email is verified, but the account still needs attention.");
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      enterEmailCode();
      return;
    }
    throw new Error(next.message);
  };

  const abandonClerkSession = async () => {
    if (await releaseClerkSession(signOut)) {
      useSession.getState().clearError();
      return;
    }
    useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
  };

  const reportSignUpFailure = (caught: unknown, fallback: string) => {
    if (isAlreadySignedInError(caught)) {
      // Clerk will not give up the session and will not let a new one start.
      // Offer sign-out instead of calling it a bad password.
      useSession.getState().failClerkSync(clerkSignOutRecoveryMessage);
      return;
    }
    setError(clerkErrorMessage(caught, fallback));
  };

  const createAccount = async () => {
    if (!signUp || !fullName.trim() || !email.trim() || !password) return;
    const mismatch = passwordConfirmationError(password, confirmPassword);
    if (mismatch) {
      setError(mismatch);
      return;
    }
    if (consentProblem || !consentReady) {
      setError(consentProblem ?? "GRIDGO's terms have not loaded yet. Try again in a moment.");
      return;
    }
    // GRIDGO enrolls this account after Clerk's emailed code, from the shared
    // bridge. What was ticked here waits for it, naming the exact versions.
    useEnrollmentConsent.getState().hold(
      documents
        ? {
            kind: "versioned",
            body: enrollmentConsentBody(
              documents.map((doc) => doc.id),
              consent,
              await legalContext(),
            ),
          }
        : { kind: "legacy" },
    );

    setError(null);
    useSession.getState().finishSigningOut();
    useSession.getState().clearError();
    try {
      await withSettledClerkSession({
        isSignedIn: Boolean(isSignedIn),
        settle: settleClerkForSignUp,
        run: async () => {
          const result = await signUp.password({
            emailAddress: email.trim().toLowerCase(),
            password,
            ...splitFullName(fullName),
          });
          if (result.error) throw result.error;
          await continueSignUp();
        },
      });
    } catch (caught) {
      reportSignUpFailure(
        caught,
        "Could not create your account. Check your details and try again.",
      );
    }
  };

  const resendEmailCode = async () => {
    if (!signUp) return;
    setError(null);
    try {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
    } catch (caught) {
      reportSignUpFailure(caught, "Could not send a new code. Try again.");
    }
  };

  const verifyEmail = async () => {
    // Read the store rather than the render's copy: a submit fired from the
    // keyboard can beat the re-render that carries the last keystroke.
    const typed = useSignupFlow.getState().code.trim();
    if (!signUp || typed.length < 6) return;
    setError(null);
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: typed });
      if (result.error) throw result.error;
      await continueSignUp({ allowEmailCode: false });
      // Adopt succeeded: drop the code step so verifying cannot keep the
      // screen armed if landing is still resolving.
      resetSignupFlow();
    } catch (caught) {
      reportSignUpFailure(caught, "That code could not be verified.");
    }
  };

  return (
    <FormScreen
      edges={["bottom"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="gg-page gap-7 py-8">
        {verifying ? (
          <OtpCodeStep
            heading={verifyCopy.heading}
            body={verifyCopy.body}
            code={code}
            onChangeCode={setCode}
            onSubmit={() => void verifyEmail()}
            onResend={() => void resendEmailCode()}
            busy={busy}
            submitLabel="Verify email"
            error={
              (error ?? sessionError) ? (
                <ErrorState
                  label="Could not verify email"
                  body={(error ?? sessionError)!}
                  retryLabel={signOutRetry}
                  onRetry={signOutRetry ? () => void abandonClerkSession() : undefined}
                />
              ) : null
            }
          />
        ) : (
          <>
            <View className="gap-2">
              <Text className="text-display font-black text-text-primary" accessibilityRole="header">
                Create Account
              </Text>
              <Text className="text-body-lg text-text-secondary">
                Your GRIDGO client account starts here.
              </Text>
            </View>
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

            <SignupConsentFields
              consent={consent}
              onChange={setConsent}
              documents={documents}
              status={libraryStatus}
              onRetry={() => void useLegalLibrary.getState().load({ force: true })}
              disabled={busy}
            />

            {/* Clerk's smart bot protection mounts its challenge here only when needed. */}
            <View nativeID="clerk-captcha" />

            {(error ?? sessionError) ? (
              <ErrorState
                label="Could not create account"
                body={(error ?? sessionError)!}
                retryLabel={signOutRetry}
                onRetry={signOutRetry ? () => void abandonClerkSession() : undefined}
              />
            ) : null}

            {consentProblem && fullName.trim() && email.trim() && password && confirmPassword ? (
              <Text className="text-caption text-text-secondary" accessibilityLiveRegion="polite">
                {consentProblem}
              </Text>
            ) : null}

            <PrimaryButton
              label={busy ? "Creating account…" : "Sign Up"}
              disabled={
                !fullName.trim() ||
                !email.trim() ||
                !password ||
                !confirmPassword ||
                Boolean(consentProblem) ||
                !consentReady ||
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
