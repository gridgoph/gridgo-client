import { type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AuthLandingRedirect, useAuthLanding } from "@/components/AuthLandingRedirect";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import * as api from "@/lib/api";
import { bridgeClerkToGridgo, wrongRoleMessage } from "@/lib/clerkSessionBridge";
import { userFacingError } from "@/lib/copy";
import {
  ACCOUNT_TYPES,
  clerkActivateInput,
  firstProfileProblem,
  needsOrgName,
  type ClientProfileFields,
} from "@/lib/signup";
import { useSession } from "@/store/session";

/**
 * Account type (and org name when required) for Google / unmapped Clerk users.
 * Email and password are already on the Clerk identity — do not re-collect them.
 */
const welcome = "/(auth)/welcome" as Href;

export default function CompleteProfileScreen() {
  const user = useSession((state) => state.user);
  const logout = useSession((state) => state.logout);
  const landing = useAuthLanding();

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
  const problem = firstProfileProblem(fields);

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await bridgeClerkToGridgo({
        me: () => api.me({ ignoreUnauthorized: true }),
        activate: (input) => api.activateClerkClient(input),
        profile: clerkActivateInput(fields),
      });
      if (result.kind === "adopt") {
        useSession.getState().adoptClerkUser(result.user, { provisioned: true });
        return;
      }
      if (result.kind === "needs_profile") {
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

        {error ? <ErrorState label="Could not finish profile" body={error} /> : null}

        <PrimaryButton
          label={busy ? "Saving…" : "Continue"}
          disabled={busy || Boolean(problem)}
          onPress={() => void save()}
        />
        <SecondaryButton label="Sign out" onPress={() => void logout()} disabled={busy} />
      </View>
    </FormScreen>
  );
}
