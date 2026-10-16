import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { legalDate, openRequestOf, PRIVACY_KINDS } from "@/lib/legal";
import { usePrivacyRequests } from "@/store/privacyRequests";

const MAX_DETAILS = 4000;

/**
 * See my data / Correct my data: what will happen, an optional (or, for a
 * correction, needed) note, and one send.
 *
 * Deletion is not here: it goes through Delete account, which checks it is
 * the account holder before anything is sent.
 */
export default function PrivacyRequestScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "correction" ? "correction" : "access";
  const copy = PRIVACY_KINDS[kind];

  const sending = usePrivacyRequests((state) => state.sending);
  const error = usePrivacyRequests((state) => state.error);
  const sent = usePrivacyRequests((state) => state.sent);
  const requests = usePrivacyRequests((state) => state.requests);
  const [details, setDetails] = useState("");

  useEffect(() => {
    usePrivacyRequests.getState().clearSend();
    return () => usePrivacyRequests.getState().clearSend();
  }, []);

  const open = openRequestOf(requests, kind);
  const missingDetails = copy.detailsRequired && !details.trim();

  if (sent) {
    const due = legalDate(sent.dueAt);
    return (
      <FormScreen>
        <View className="gg-page gap-6 pb-16 pt-4" accessibilityLiveRegion="polite">
          <View className="gap-3">
            <CircleCheck size={32} color={colors.success} aria-hidden />
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Request sent
            </Text>
            <Text className="text-body-lg text-text-primary">
              {due ? `GRIDGO will answer by ${due}.` : "GRIDGO will answer as soon as it can."}
            </Text>
            <Text className="text-body text-text-secondary">
              Operations check it is you first, so they may contact you on your sign-in email.
              You can follow it on Your data.
            </Text>
          </View>
          <SecondaryButton label="Back to Your data" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <View className="gg-page gap-6 pb-16 pt-4">
        <View className="gap-3">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text className="text-body-lg text-text-secondary">{copy.explain}</Text>
        </View>

        {open ? (
          <View className="gg-panel gap-1">
            <Text className="text-body font-medium text-text-primary">
              You already asked on {legalDate(open.requestedAt) ?? "an earlier day"}
            </Text>
            <Text className="text-body text-text-secondary">
              That request is still open
              {legalDate(open.dueAt) ? `, due by ${legalDate(open.dueAt)}` : ""}. Send another
              only if you have something to add.
            </Text>
          </View>
        ) : null}

        <FormField
          label={copy.detailsLabel}
          helper={copy.detailsHelper}
          optional={!copy.detailsRequired}
        >
          <TextField
            value={details}
            onChangeText={setDetails}
            accessibilityLabel={copy.detailsLabel}
            placeholder={copy.detailsRequired ? "What is wrong, and what it should be" : undefined}
            multiline
            maxLength={MAX_DETAILS}
            editable={!sending}
          />
        </FormField>

        {error ? <ErrorState label="Not sent" body={error} /> : null}

        <View className="gap-3">
          <PrimaryButton
            label={sending ? "Sending…" : "Send request"}
            disabled={sending || missingDetails}
            onPress={() => void usePrivacyRequests.getState().send(kind, details)}
          />
          <SecondaryButton label="Cancel" disabled={sending} onPress={() => router.back()} />
        </View>
      </View>
    </FormScreen>
  );
}
