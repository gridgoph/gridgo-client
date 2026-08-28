import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FormField } from "@/components/form/FormField";
import { PasswordField } from "@/components/form/PasswordField";
import {
  changeSignInPassword,
  EMPTY_PASSWORD_DRAFT,
  MIN_PASSWORD_LENGTH,
  passwordProblems,
  PASSWORD_CHANGED,
  PASSWORD_NO_PASSWORD_SET,
  PASSWORD_WRONG_CURRENT,
  type PasswordDraft,
  type PasswordField as PasswordFieldName,
} from "@/lib/clerkIdentity";

/**
 * Setting a new password on the GRIDGO sign-in.
 *
 * Clerk's own user resource does this — `user.updatePassword`, checked against
 * the installed `@clerk/expo` types rather than assumed — so the client stays
 * signed in throughout. Mailing a reset code to somebody who is already signed
 * in and knows their password would be a longer road to the same place, and
 * the signed-out "Forgot password" flow on the login screen is still there for
 * the case this screen cannot help with.
 *
 * Its own screen, not a row of fields on **Your details**, for the same reason
 * the email is: three boxes and a consequence is a commitment, and it needs
 * the one yellow action on the screen to be the commitment itself.
 *
 * **Every other session is signed out, and the screen says so before the tap
 * rather than after it.** Somebody changing a password on a phone is either
 * tidying up or locking somebody out, and the second is the reason that
 * matters. An option to leave the other sessions running would be missed by
 * exactly the person who most needed it, so there is no option — only a
 * sentence, above the button, in the same words the confirmation uses.
 */
export default function ChangePasswordScreen() {
  const { user: clerkUser, isLoaded } = useUser();

  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [refusal, setRefusal] = useState<{ field: PasswordFieldName; message: string } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problems = passwordProblems(draft);

  /** Clerk's refusal always shows; a typo only after a change is tried. */
  function fieldError(field: PasswordFieldName): string | null {
    if (refusal?.field === field) return refusal.message;
    return showProblems ? (problems[field] ?? null) : null;
  }

  function edit(patch: Partial<PasswordDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    // A refusal was about what was typed a moment ago.
    setRefusal(null);
    setNotice(null);
  }

  async function submit() {
    if (!clerkUser || busy) return;

    if (Object.keys(problems).length) {
      setShowProblems(true);
      return;
    }

    setBusy(true);
    setRefusal(null);
    setNotice(null);
    const outcome = await changeSignInPassword(clerkUser, draft);
    setBusy(false);

    if (outcome.status === "ok") {
      setDraft(EMPTY_PASSWORD_DRAFT);
      setShowProblems(false);
      setDone(true);
      return;
    }

    if (outcome.status === "wrong_current") {
      setRefusal({ field: "current", message: PASSWORD_WRONG_CURRENT });
      return;
    }
    setNotice(outcome.message);
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
   * An account that has only ever signed in with Google has no password, so
   * there is nothing here to change. Said as a fact about how this account
   * works rather than as a refusal, because nothing has gone wrong and there
   * is nothing for the client to fix.
   */
  if (isLoaded && clerkUser && clerkUser.passwordEnabled === false) {
    return (
      <FormScreen>
        <View className="gg-page gap-8 pb-16 pt-4">
          <View className="gap-3">
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              This account has no password
            </Text>
            <Text className="text-body text-text-secondary">
              {PASSWORD_NO_PASSWORD_SET}
            </Text>
          </View>
          <SecondaryButton label="Back to your details" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  /*
   * The confirmation takes the whole screen rather than closing it.
   *
   * Signing every other session out is a consequence somebody may need to act
   * on — a shared computer, a phone they no longer have — and a screen that
   * simply disappeared would leave them wondering whether it happened at all.
   */
  if (done) {
    return (
      <FormScreen>
        <View className="gg-page gap-8 pb-16 pt-4">
          <View className="gap-3">
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Password changed
            </Text>
            <Text className="text-body text-text-secondary">{PASSWORD_CHANGED}</Text>
          </View>
          <SecondaryButton label="Back to your details" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen overlay={<LoadingOverlay visible={busy} label="Changing your password…" />}>
      <View className="gg-page gap-8 pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            Change your password
          </Text>
          <Text className="text-body text-text-secondary">
            This is the password you sign in to GRIDGO with. If you have forgotten it, sign
            out and use “Forgot password” on the sign-in screen instead.
          </Text>
        </View>

        <View className="gap-6">
          <FormField
            label="Current password"
            helper="The one you sign in with now."
            error={fieldError("current")}
          >
            <PasswordField
              value={draft.current}
              onChangeText={(current) => edit({ current })}
              accessibilityLabel="Current password"
              placeholder="Your current password"
              textContentType="password"
            />
          </FormField>

          <FormField
            label="New password"
            helper={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            error={fieldError("next")}
          >
            <PasswordField
              value={draft.next}
              onChangeText={(next) => edit({ next })}
              accessibilityLabel="New password"
              placeholder="Your new password"
              textContentType="newPassword"
            />
          </FormField>

          <FormField
            label="Confirm new password"
            helper="Type it again so a typo cannot lock you out."
            error={fieldError("confirm")}
          >
            <PasswordField
              value={draft.confirm}
              onChangeText={(confirm) => edit({ confirm })}
              accessibilityLabel="Confirm new password"
              placeholder="Your new password again"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
          </FormField>
        </View>

        {notice ? <ErrorState label="Not changed" body={notice} /> : null}

        {/* Said before the tap, in the words the confirmation will use. */}
        <View className="gap-4">
          <Text className="text-caption text-text-muted">
            Changing your password signs you out everywhere else you are signed in. This
            phone stays signed in.
          </Text>
          <PrimaryButton
            label={busy ? "Changing…" : "Change password"}
            disabled={busy}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </FormScreen>
  );
}
