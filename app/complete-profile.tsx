import { useUser } from "@clerk/expo";
import { type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { SignupConsentFields } from "@/components/legal/SignupConsentFields";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import * as api from "@/lib/api";
import { bridgeClerkToGridgo, wrongRoleMessage } from "@/lib/clerkSessionBridge";
import { userFacingError } from "@/lib/copy";
import {
  EMPTY_SIGNUP_CONSENT,
  enrollmentConsentBody,
  signupConsentProblem,
  signupDocuments,
  type SignupConsent,
} from "@/lib/legal";
import { legalContext } from "@/lib/legalContext";
import {
  ACCOUNT_TYPES,
  clerkActivateInput,
  firstProfileProblem,
  needsOrgName,
  type ClientProfileFields,
} from "@/lib/signup";
import { useLegalLibrary } from "@/store/legalLibrary";
import { useSession } from "@/store/session";

/**
 * Two ways a Clerk identity can still be short of a GRIDGO client:
 *
 * - **Not enrolled yet** (no `user`): a Google sign-up, or an app that restarted
 *   between Clerk's code and GRIDGO's activate. GRIDGO enrolls nobody who has
 *   not agreed to its terms, so this asks the sign-up form's boxes — the
 *   documents, the age question, the agreement and the optional news box —
 *   and activates with them.
 * - **Enrolled, profile incomplete**: account type (and org name when required).
 *
 * Email and password are already on the Clerk identity — do not re-collect them.
 */
const welcome = "/(auth)/welcome" as Href;

export default function CompleteProfileScreen() {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const landing = useAuthLanding();
  const { user: clerkUser } = useUser();
  const enrolling = !user;
  const [consent, setConsent] = useState<SignupConsent>(EMPTY_SIGNUP_CONSENT);
  const libraryStatus = useLegalLibrary((state) => state.status);
  const documents = signupDocuments(useLegalLibrary((state) => state.documents));

  useEffect(() => {
    if (enrolling) void useLegalLibrary.getState().load();
  }, [enrolling]);

  const [accountType, setAccountType] = useState(user?.accountType ?? ACCOUNT_TYPES[0].value);
  const [orgName, setOrgName] = useState(user?.orgName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only the "still incomplete" rung keeps this screen up; everything else is
  // the shared ladder, so a finished profile cannot be stranded here.
  if (landing.kind !== "complete_profile") {
    return <AuthLandingRedirect landing={landing} whenSignedOut={welcome} />;
  }

  const fields: ClientProfileFields = { accountType, orgName };
  const consentReady = Boolean(documents) || libraryStatus === "unsupported";
  const problem = enrolling
    ? (signupConsentProblem(consent) ??
      (consentReady ? null : "GRIDGO's terms have not loaded yet. Try again in a moment."))
    : firstProfileProblem(fields);

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const context = enrolling ? await legalContext() : null;
      const result = await bridgeClerkToGridgo({
        me: () => api.me({ ignoreUnauthorized: true }),
        activate: (input) => api.activateClerkClient(input),
        ...(enrolling
          ? {
              consent: async () =>
                documents && context
                  ? enrollmentConsentBody(
                      documents.map((doc) => doc.id),
                      consent,
                      context,
                    )
                  : "legacy",
            }
          : { profile: clerkActivateInput(fields) }),
      });
      if (result.kind === "adopt") {
        useSession.getState().adoptClerkUser(result.user, { provisioned: true });
        return;
      }
      if (result.kind === "needs_profile") {
        if (enrolling) {
          // GRIDGO refused the agreement — most likely a newer version took
          // effect while this screen was open. Read it again and re-ask.
          setConsent({ ...consent, agreed: false });
          void useLegalLibrary.getState().load({ force: true });
          setError("GRIDGO's terms changed while you were reading. Read them again, then agree.");
          return;
        }
        setError(firstProfileProblem(fields) ?? "Choose how this GRIDGO account is used.");
        return;
      }
      if (result.kind === "wrong_role") {
        await logout();
        useSession.getState().failClerkSync(wrongRoleMessage(result.role));
        return;
      }
      if (result.signOut) await logout();
      setError(result.message);
    } catch (caught) {
      setError(userFacingError(caught, "Could not finish your GRIDGO profile. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen
      edges={["top", "bottom"]}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View className="gg-page gap-7 py-8">
        {enrolling ? (
          <>
            <View className="gap-2">
              <Text className="text-display font-black text-text-primary" accessibilityRole="header">
                Finish signing up
              </Text>
              <Text className="text-body-lg text-text-secondary">
                {clerkUser?.primaryEmailAddress?.emailAddress
                  ? `You are signed in as ${clerkUser.primaryEmailAddress.emailAddress}. Agree to GRIDGO's terms to create your client account.`
                  : "You are signed in. Agree to GRIDGO's terms to create your client account."}
              </Text>
            </View>
            <SignupConsentFields
              consent={consent}
              onChange={setConsent}
              documents={documents}
              status={libraryStatus}
              onRetry={() => void useLegalLibrary.getState().load({ force: true })}
              disabled={busy}
            />
          </>
        ) : (
          <>
            <View className="gap-2">
              <Text className="text-display font-black text-text-primary" accessibilityRole="header">
                Finish your profile
              </Text>
              <Text className="text-body-lg text-text-secondary">
                Google already verified you. Tell GRIDGO how this client account is used.
              </Text>
            </View>

            <View className="gap-3" accessibilityRole="radiogroup">
              {ACCOUNT_TYPES.map((option) => {
                const selected = accountType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    onPress={() => setAccountType(option.value)}
                    className={selected ? "gg-panel-high gap-1" : "gg-card gap-1"}
                  >
                    <Text className="text-body-lg font-medium text-text-primary">{option.label}</Text>
                    <Text className="text-caption text-text-secondary">{option.hint}</Text>
                  </Pressable>
                );
              })}
            </View>

            {needsOrgName(accountType) ? (
              <FormField
                label={accountType === "business" ? "Business name" : "Organization name"}
              >
                <TextField
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder={
                    accountType === "business" ? "Davao Events Co." : "San Pedro Parish"
                  }
                  accessibilityLabel={
                    accountType === "business" ? "Business name" : "Organization name"
                  }
                  autoCapitalize="words"
                  returnKeyType="go"
                  onSubmitEditing={() => void save()}
                  maxLength={80}
                />
              </FormField>
            ) : null}
          </>
        )}

        {error ? (
          <ErrorState
            label={enrolling ? "Could not create your account" : "Could not finish profile"}
            body={error}
          />
        ) : enrolling && problem ? (
          <Text className="text-caption text-text-secondary" accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}

        <PrimaryButton
          label={busy ? (enrolling ? "Creating account…" : "Saving…") : enrolling ? "Create my account" : "Continue"}
          disabled={busy || Boolean(problem)}
          onPress={() => void save()}
        />
        <SecondaryButton label="Sign out" onPress={() => void logout()} disabled={busy} />
      </View>
    </FormScreen>
  );
}
