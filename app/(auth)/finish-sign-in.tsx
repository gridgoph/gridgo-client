import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/expo";
import { useRouter, type Href } from "expo-router";
import { Mail, Smartphone } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { OtpCodeStep } from "@/components/auth/OtpCodeStep";
import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { staysOnAuthScreen } from "@/lib/authLanding";
import { clerkErrorMessage } from "@/lib/clerkAuth";
import { completeClerkAuth } from "@/lib/clerkComplete";
import {
  codeStepCopy,
  contactKindsToAsk,
  contactProblem,
  contactStepCopy,
  contactValue,
  isContactTakenError,
  linkCodeCopy,
  signInNeedsLinkCode,
  signUpNeedsContact,
  type ContactKind,
} from "@/lib/socialSignIn";
import { useSession } from "@/store/session";
import { useSocialFinish } from "@/store/socialFinish";

const login = "/(auth)/login" as Href;

type ClerkFlowAnswer = { error: unknown };

/** Clerk's flow methods answer with an error rather than throwing; make them throw. */
async function must(answer: Promise<ClerkFlowAnswer>) {
  const { error } = await answer;
  if (error) throw error;
}

const SIGN_IN_HERE_INSTEAD =
  "This account uses two-step sign-in. Sign in with your email and password to finish.";

/**
 * The end of a Facebook sign-in that Clerk could not finish on its own
 * (`lib/socialSignIn.ts`):
 *
 * - Facebook shared no email, so the person adds an email or mobile and
 *   verifies a six-digit code before the account is made.
 * - That email or mobile already belongs to a GRIDGO person, so the code is
 *   sent to it and signs in to that account instead. Never a second user.
 * - Clerk wants the email Facebook shared confirmed before joining Facebook
 *   to the account that already holds it.
 *
 * The state of the attempt is Clerk's (`useSignUp` / `useSignIn`), so this
 * screen reads it rather than taking it in params. Nothing is left to finish
 * — an expired attempt, a Fast Refresh — is said, with a way back to sign in.
 */
export default function FinishSignInScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const landing = useAuthLanding();
  const { signUp } = useSignUp();
  const { signIn } = useSignIn();
  const { getToken } = useAuth();
  const { setActive, signOut } = useClerk();
  const adoptLoading = useSession((state) => state.loading);
  const sessionError = useSession((state) => state.error);
  const {
    step,
    kind,
    contact,
    existing,
    code,
    busy,
    checked,
    error,
    setKind,
    setContact,
    setCode,
    setBusy,
    setError,
    check,
    enterCode,
    backToContact,
  } = useSocialFinish();

  const kinds = contactKindsToAsk(signUp);
  const needsContact = signUpNeedsContact(signUp);
  const needsLinkCode = !needsContact && signInNeedsLinkCode(signIn);

  // Open on the contact Clerk asks for, or send the link code straight away.
  useEffect(() => {
    const state = useSocialFinish.getState();
    if (state.step !== "contact" || state.busy) return;
    if (needsContact) {
      const first = contactKindsToAsk(signUp)[0];
      if (first && !contactKindsToAsk(signUp).includes(state.kind)) state.setKind(first);
      return;
    }
    if (needsLinkCode && signIn) {
      state.setBusy(true);
      void must(signIn.emailCode.sendCode())
        .then(() => useSocialFinish.getState().enterLinkCode())
        .catch((caught: unknown) =>
          useSocialFinish
            .getState()
            .setError(clerkErrorMessage(caught, "Could not send the code. Try again.")),
        )
        .finally(() => useSocialFinish.getState().setBusy(false));
    }
    // Clerk's resources are read fresh from the store inside; re-run only when
    // what Clerk is asking for changes.
  }, [needsContact, needsLinkCode, signIn, signUp]);

  if (!staysOnAuthScreen(landing)) return <AuthLandingRedirect landing={landing} />;

  const finish = (finalize: () => Promise<{ error: unknown } | void | null>) =>
    completeClerkAuth({
      finalize,
      getToken,
      signOut,
      setActive: (args) => setActive(args),
    });

  const run = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    useSession.getState().clearError();
    try {
      await work();
    } catch (caught) {
      setError(clerkErrorMessage(caught, fallback));
    } finally {
      setBusy(false);
    }
  };

  /** Ask Clerk to send a code to the contact typed, on the sign-up or — if it is taken — a sign-in. */
  const sendCode = () => {
    check();
    if (contactProblem(kind, contact)) return;
    const value = contactValue(kind, contact);
    return run(async () => {
      if (!signUp || !signIn) throw new Error("This sign-in expired. Go back and try again.");
      const { error: refused } = await signUp.update(
        kind === "email" ? { emailAddress: value } : { phoneNumber: value },
      );
      if (refused && !isContactTakenError(refused)) throw refused;
      if (refused) {
        // An existing GRIDGO person: sign in to that account with a code sent to it.
        await must(signIn.create({ identifier: value }));
        await must(kind === "email" ? signIn.emailCode.sendCode() : signIn.phoneCode.sendCode());
        enterCode(true);
        return;
      }
      await must(
        kind === "email"
          ? signUp.verifications.sendEmailCode()
          : signUp.verifications.sendPhoneCode(),
      );
      enterCode(false);
    }, "Could not send the code. Check it and try again.");
  };

  const resendCode = () =>
    run(async () => {
      if (!signUp || !signIn) throw new Error("This sign-in expired. Go back and try again.");
      if (step === "linkCode" || existing) {
        await must(kind === "phone" && existing ? signIn.phoneCode.sendCode() : signIn.emailCode.sendCode());
        return;
      }
      await must(
        kind === "email"
          ? signUp.verifications.sendEmailCode()
          : signUp.verifications.sendPhoneCode(),
      );
    }, "Could not send a new code. Try again.");

  const verifyCode = () => {
    const typed = useSocialFinish.getState().code.trim();
    if (typed.length < 6) return;
    return run(async () => {
      if (!signUp || !signIn) throw new Error("This sign-in expired. Go back and try again.");
      if (step === "linkCode" || existing) {
        await must(
          kind === "phone" && existing
            ? signIn.phoneCode.verifyCode({ code: typed })
            : signIn.emailCode.verifyCode({ code: typed }),
        );
        if (signIn.status !== "complete") throw new Error(SIGN_IN_HERE_INSTEAD);
        await finish(() => signIn.finalize());
        return;
      }
      await must(
        kind === "email"
          ? signUp.verifications.verifyEmailCode({ code: typed })
          : signUp.verifications.verifyPhoneCode({ code: typed }),
      );
      if (signUp.status === "complete") {
        await finish(() => signUp.finalize());
        return;
      }
      // Clerk wants the other contact as well: ask for it the same way.
      if (signUpNeedsContact(signUp)) {
        backToContact();
        const next = contactKindsToAsk(signUp)[0];
        if (next) setKind(next);
        return;
      }
      throw new Error("Your code was accepted, but the account still needs attention. Try again.");
    }, "That code could not be verified.");
  };

  const shownError = error ?? sessionError;
  const working = busy || adoptLoading;

  if (step === "code" || step === "linkCode") {
    const copy =
      step === "linkCode"
        ? linkCodeCopy(signIn?.identifier)
        : codeStepCopy(kind, contact.trim(), existing);
    return (
      <FormScreen edges={["bottom"]} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View className="gg-page gap-7 py-8">
          <OtpCodeStep
            heading={copy.heading}
            body={copy.body}
            code={code}
            onChangeCode={setCode}
            onSubmit={() => void verifyCode()}
            onResend={() => void resendCode()}
            busy={working}
            submitLabel={existing || step === "linkCode" ? "Sign in" : "Verify and continue"}
            error={
              shownError ? (
                <ErrorState
                  label="Could not verify code"
                  body={shownError}
                  retryLabel={shownError === SIGN_IN_HERE_INSTEAD ? "Sign in with email" : undefined}
                  onRetry={
                    shownError === SIGN_IN_HERE_INSTEAD ? () => router.replace(login) : undefined
                  }
                />
              ) : null
            }
          />
          {step === "code" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={kind === "email" ? "Use a different email" : "Use a different number"}
              disabled={working}
              onPress={backToContact}
              className="gg-touch -mt-3 self-center justify-center px-2"
            >
              <Text className="text-button text-text-secondary">
                {kind === "email" ? "Use a different email" : "Use a different number"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </FormScreen>
    );
  }

  if (!needsContact) {
    // Sending the link code, or nothing left to finish here.
    return (
      <FormScreen edges={["bottom"]} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View className="gg-page gap-6 py-8">
          <View className="gap-2">
            <Text className="text-display font-black text-text-primary" accessibilityRole="header">
              {needsLinkCode ? "Sending your code" : "Let's start again"}
            </Text>
            <Text className="text-body-lg text-text-secondary">
              {needsLinkCode
                ? "One moment — we're sending a six-digit code to the email Facebook shared."
                : "This Facebook sign-in has expired. Nothing was saved. Sign in again to continue."}
            </Text>
          </View>
          {shownError ? <ErrorState label="Could not send the code" body={shownError} /> : null}
          {needsLinkCode && !shownError ? null : (
            <SecondaryButton label="Back to sign in" onPress={() => router.replace(login)} />
          )}
        </View>
      </FormScreen>
    );
  }

  const copy = contactStepCopy(kinds);
  const problem = checked ? contactProblem(kind, contact) : null;

  return (
    <FormScreen edges={["bottom"]} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <View className="gg-page gap-7 py-8">
        <View className="gap-2">
          <Text className="text-display font-black text-text-primary" accessibilityRole="header">
            {copy.heading}
          </Text>
          <Text className="text-body-lg text-text-secondary">{copy.body}</Text>
        </View>

        <View className="gap-4">
          {kinds.length > 1 ? (
            <View
              className="flex-row rounded-field border border-outline bg-surface-variant p-1"
              accessibilityRole="radiogroup"
              accessibilityLabel="Add an email or a mobile number"
            >
              {kinds.map((option) => (
                <ContactOption
                  key={option}
                  kind={option}
                  selected={kind === option}
                  disabled={working}
                  onPress={() => setKind(option)}
                  color={kind === option ? colors.textPrimary : colors.textMuted}
                />
              ))}
            </View>
          ) : null}

          {kind === "email" ? (
            <FormField label="Email" error={problem}>
              <TextField
                value={contact}
                onChangeText={setContact}
                placeholder="you@company.com"
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="go"
                maxLength={120}
                onSubmitEditing={() => void sendCode()}
              />
            </FormField>
          ) : (
            <FormField label="Mobile number" helper="A Philippine mobile, for example 0917 123 4567." error={problem}>
              <TextField
                value={contact}
                onChangeText={setContact}
                placeholder="0917 123 4567"
                accessibilityLabel="Mobile number"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                returnKeyType="go"
                maxLength={20}
                onSubmitEditing={() => void sendCode()}
              />
            </FormField>
          )}
        </View>

        {shownError ? <ErrorState label="Could not send the code" body={shownError} /> : null}

        <PrimaryButton
          label={working ? "Sending code…" : "Send code"}
          disabled={!contact.trim() || working}
          onPress={() => void sendCode()}
        />

        <Text className="text-center text-caption text-text-muted">
          GRIDGO never posts to your Facebook.
        </Text>
      </View>
    </FormScreen>
  );
}

function ContactOption({
  kind,
  selected,
  disabled,
  onPress,
  color,
}: {
  kind: ContactKind;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  color: string;
}) {
  const label = kind === "email" ? "Email" : "Mobile";
  const Icon = kind === "email" ? Mail : Smartphone;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={
        selected
          ? "min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-field bg-surface-high"
          : "min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-field"
      }
    >
      <Icon size={16} color={color} strokeWidth={2} />
      <Text className={selected ? "text-button text-text-primary" : "text-button text-text-muted"}>
        {label}
      </Text>
    </Pressable>
  );
}
