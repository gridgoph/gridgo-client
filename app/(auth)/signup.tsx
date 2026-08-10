import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState } from "@/components/ErrorState";
import { FormField, FormSection } from "@/components/form/FormField";
import { OptionPicker } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import {
  ACCOUNT_TYPES,
  accountTypeOption,
  canSubmitSignup,
  checkSignupField,
  EMPTY_SIGNUP,
  firstSignupProblem,
  MIN_PASSWORD_LENGTH,
  needsOrgName,
  type SignupFields,
} from "@/lib/signup";
import type { AccountType } from "@/lib/api";
import { useSession } from "@/store/session";

/**
 * Creating a client account.
 *
 * The one declaration that outlives this screen is what kind of client this
 * is. It reaches the API, comes back on every session, and decides whether the
 * app wears the GRIDGO Business lockup — so it is asked first, in the words
 * someone would use about themselves, and never as an afterthought.
 *
 * Reasons appear under the field they belong to, and only once the client has
 * left it. The button stays live and says what is missing rather than sitting
 * greyed out with no explanation.
 */
export default function SignupScreen() {
  const colors = useThemeColors();
  const { signUp, loading, error } = useSession();

  const [fields, setFields] = useState<SignupFields>(EMPTY_SIGNUP);
  const [touched, setTouched] = useState<Partial<Record<keyof SignupFields, boolean>>>({});
  const [attempted, setAttempted] = useState(false);

  const patch = (next: Partial<SignupFields>) =>
    setFields((current) => ({ ...current, ...next }));

  const reasonFor = (field: keyof SignupFields): string | null => {
    if (!touched[field] && !attempted) return null;
    return checkSignupField(field, fields).reason;
  };

  const submit = () => {
    setAttempted(true);
    if (!canSubmitSignup(fields)) return;
    void signUp(fields);
  };

  const blocking = firstSignupProblem(fields);
  const orgRequired = needsOrgName(fields.accountType);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView className="gg-screen" keyboardShouldPersistTaps="handled">
          <View className="gg-page gap-8 pb-16 pt-4">
            <View className="gap-2">
              <Text className="text-h1 text-text-primary" accessibilityRole="header">
                Create your account
              </Text>
              <Text className="text-body-lg text-text-secondary">
                One account requests print jobs, approves the artwork and follows the delivery.
              </Text>
            </View>

            <FormSection title="Who this account is for">
              <FormField
                label="Account type"
                helper={accountTypeOption(fields.accountType).hint}
              >
                <OptionPicker
                  title="Who is this account for?"
                  accessibilityLabel="Account type"
                  value={fields.accountType}
                  options={ACCOUNT_TYPES.map((option) => ({
                    value: option.value,
                    label: option.label,
                    hint: option.hint,
                  }))}
                  onChange={(value) => patch({ accountType: value as AccountType })}
                  placeholder="Choose one"
                />
              </FormField>

              <FormField label="Your name" error={reasonFor("name")}>
                <TextField
                  value={fields.name}
                  onChangeText={(name) => patch({ name })}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="Ana Santos"
                  accessibilityLabel="Your name"
                  autoCapitalize="words"
                  textContentType="name"
                  maxLength={80}
                />
              </FormField>

              {orgRequired ? (
                <FormField
                  label={fields.accountType === "business" ? "Business name" : "Organization name"}
                  helper="Suppliers see this on every job you send."
                  error={reasonFor("orgName")}
                >
                  <TextField
                    value={fields.orgName}
                    onChangeText={(orgName) => patch({ orgName })}
                    onBlur={() => setTouched((t) => ({ ...t, orgName: true }))}
                    placeholder="Davao Events Co."
                    accessibilityLabel="Organization name"
                    autoCapitalize="words"
                    maxLength={80}
                  />
                </FormField>
              ) : null}
            </FormSection>

            <FormSection title="How to reach you">
              <FormField label="Email" error={reasonFor("email")}>
                <TextField
                  value={fields.email}
                  onChangeText={(email) => patch({ email })}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder="you@company.com"
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  maxLength={120}
                />
              </FormField>

              <FormField
                label="Mobile number"
                helper="Operations calls this number if a job needs a decision quickly."
                error={reasonFor("phone")}
              >
                <TextField
                  value={fields.phone}
                  onChangeText={(phone) => patch({ phone })}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  placeholder="0917 123 4567"
                  accessibilityLabel="Mobile number"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  maxLength={24}
                />
              </FormField>

              <FormField
                label="Password"
                helper={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                error={reasonFor("password")}
              >
                <TextField
                  value={fields.password}
                  onChangeText={(password) => patch({ password })}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  // No placeholder: the helper below already states the only
                  // rule, and a field that says it twice reads as a draft.
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />
              </FormField>
            </FormSection>

            {error ? <ErrorState label="Could not create the account" body={error} /> : null}

            <View className="gap-3">
              <PrimaryButton
                label={loading ? "Creating your account…" : "Create account"}
                disabled={loading}
                onPress={submit}
              />
              {attempted && blocking ? (
                <Text className="text-caption text-error">{blocking}</Text>
              ) : null}
            </View>

            <Text className="text-caption text-text-muted">
              GRIDGO ships one app per role. Suppliers and riders sign up in their own app and
              wait on Operations to approve them.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
