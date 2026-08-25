import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { OtpCodeStep } from "@/components/auth/OtpCodeStep";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import {
  clientIdentity,
  confirmEmailChange,
  emailKeptByGridgo,
  EMAIL_ALREADY_REGISTERED,
  newEmailProblem,
  resendEmailCode,
  startEmailChange,
  type ClerkEmailAddress,
} from "@/lib/clerkIdentity";
import { useSession } from "@/store/session";

/**
 * Moving the address a client signs in with.
 *
 * Its own screen because it is a commitment with steps, not a field: an
 * address is claimed, a code is answered, and only then does anything change.
 * Doing it inline on **Your details** would also put a second yellow action on
 * a screen that already has one, and the yellow here has to be the step the
 * client is actually on.
 *
 * The ending this screen exists for is the one nobody expects. Clerk and
 * GRIDGO hold the address separately: Clerk can accept it while GRIDGO keeps
 * its own, because GRIDGO will not take an address another client's record
 * already holds. That is neither a failure to retry nor a success to
 * celebrate, so it is said in full and sent to Operations — the one thing this
 * screen must never do is quietly leave two different addresses on one account
 * and say "saved".
 */
export default function ChangeEmailScreen() {
  const { user: clerkUser, isLoaded } = useUser();
  const refresh = useSession((s) => s.refresh);
  const sessionUser = useSession((s) => s.user);

  // Clerk's primary address is the one that actually signs in, so it is what
  // this screen compares against — not GRIDGO's copy, which may lag it.
  const currentEmail = clientIdentity(clerkUser, sessionUser).email;

  const [address, setAddress] = useState("");
  const [pending, setPending] = useState<ClerkEmailAddress | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Clerk moved and GRIDGO did not. A notice, deliberately not an error. */
  const [split, setSplit] = useState<string | null>(null);

  async function send() {
    if (!clerkUser || busy) return;
    const wrong = newEmailProblem(address, currentEmail);
    if (wrong) {
      setProblem(wrong);
      return;
    }

    setBusy(true);
    setProblem(null);
    const outcome = await startEmailChange(clerkUser, address);
    setBusy(false);

    if (outcome.status === "ok") {
      setPending(outcome.value);
      setCode("");
      return;
    }
    setProblem(
      outcome.status === "already_registered" ? EMAIL_ALREADY_REGISTERED : outcome.message,
    );
  }

  async function resend() {
    if (!pending || busy) return;
    setBusy(true);
    setProblem(null);
    const outcome = await resendEmailCode(pending);
    setBusy(false);
    if (outcome.status === "failed") setProblem(outcome.message);
  }

  async function confirm() {
    if (!clerkUser || !pending || busy) return;
    setBusy(true);
    setProblem(null);
    const outcome = await confirmEmailChange(clerkUser, pending, code);

    if (outcome.status !== "ok") {
      setBusy(false);
      setProblem(
        outcome.status === "already_registered"
          ? EMAIL_ALREADY_REGISTERED
          : outcome.message,
      );
      return;
    }

    // GRIDGO copies the sign-in's primary address onto the account when it
    // reads it — unless another client's record already holds it, in which
    // case it leaves both alone. Reading the account back is the only way to
    // find out which of those happened.
    await refresh();
    setBusy(false);

    const gridgoEmail = useSession.getState().user?.email ?? "";
    if (gridgoEmail.trim().toLowerCase() === outcome.value.trim().toLowerCase()) {
      router.back();
      return;
    }
    setSplit(emailKeptByGridgo(outcome.value, gridgoEmail || "the address it had"));
  }

  if (isLoaded && !clerkUser) {
    return (
      <FormScreen>
        <View className="gg-page gap-6 pt-4">
          <ErrorState
            label="Sign-in unavailable"
            body="GRIDGO could not reach the account behind this client. Go back, then open your details again."
            retryLabel="Go back"
            onRetry={() => router.back()}
          />
        </View>
      </FormScreen>
    );
  }

  /*
   * The split ending takes the whole screen.
   *
   * A client who has just answered a code is expecting the screen to close, so
   * a sentence tucked under a form they have stopped reading is a sentence
   * they will not read. This replaces the form, because there is nothing left
   * to do here and the next move belongs to Operations.
   */
  if (split) {
    return (
      <FormScreen>
        <View className="gg-page gap-8 pb-16 pt-4">
          <View className="gap-3">
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Your sign-in moved. GRIDGO’s copy did not.
            </Text>
            <Text className="text-body text-text-secondary">{split}</Text>
          </View>
          <SecondaryButton label="Back to your details" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  if (pending) {
    return (
      <FormScreen overlay={<LoadingOverlay visible={busy} label="Checking that code…" />}>
        <View className="gg-page gap-6 pb-16 pt-4">
          <OtpCodeStep
            heading="Check your new email"
            body={`GRIDGO sent a six-digit code to ${pending.emailAddress}. Enter it to start signing in with that address.`}
            code={code}
            onChangeCode={setCode}
            onSubmit={() => void confirm()}
            onResend={() => void resend()}
            busy={busy}
            submitLabel="Use this address"
            error={
              problem ? <ErrorState label="Code not accepted" body={problem} /> : null
            }
          />
          <SecondaryButton
            label="Use a different address"
            disabled={busy}
            onPress={() => {
              setPending(null);
              setCode("");
              setProblem(null);
            }}
          />
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen overlay={<LoadingOverlay visible={busy} label="Sending your code…" />}>
      <View className="gg-page gap-8 pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            Change your sign-in email
          </Text>
          <Text className="text-body text-text-secondary">
            {currentEmail
              ? `You sign in to GRIDGO with ${currentEmail}. Enter the address you want to use instead and GRIDGO sends it a six-digit code.`
              : "Enter the address you want to sign in with and GRIDGO sends it a six-digit code."}
          </Text>
        </View>

        <FormField
          label="New email"
          helper="Nothing changes until you answer the code sent to this address."
          error={problem}
        >
          <TextField
            value={address}
            onChangeText={(next) => {
              setAddress(next);
              setProblem(null);
            }}
            placeholder="ana@company.com"
            accessibilityLabel="New email"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => void send()}
          />
        </FormField>

        <PrimaryButton
          label={busy ? "Sending…" : "Send code"}
          disabled={busy}
          onPress={() => void send()}
        />
      </View>
    </FormScreen>
  );
}
