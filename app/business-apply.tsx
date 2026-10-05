import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { ApplicationFlow } from "@/components/application/ApplicationFlow";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { businessApplication } from "@/lib/accountProfile";
import { useOwnOrganization } from "@/store/organization";
import { useSession } from "@/store/session";

/**
 * Applying for an organization or business account (gridgo-client#163), or —
 * with `?mode=first_officer` — an approved organization verifying the officer
 * it never had to name before (#164).
 *
 * This is a **client** account upgrade. It is not an application to become a
 * print shop: suppliers exist by invitation from Operations and have an app of
 * their own, and nothing here goes near that.
 */
export default function BusinessApplyScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const user = useSession((s) => s.user);
  const organization = useOwnOrganization();
  const application = businessApplication(user);
  // Opening the form again from the pending card is a deliberate choice, so it
  // is held for this visit only.
  const [correcting, setCorrecting] = useState(false);

  if (params.mode === "first_officer") {
    return <ApplicationFlow mode="first_officer" organization={organization} onDone={() => router.back()} />;
  }

  if (application?.status === "pending" && !correcting) {
    return <PendingApplication onCorrect={() => setCorrecting(true)} />;
  }

  return <ApplicationFlow mode="apply" onDone={() => router.back()} />;
}

/**
 * The application is with Operations. Says what that means for ordering, and
 * keeps one way back in: applications sent before documents were asked for
 * cannot be approved until they are sent again with the checklist.
 */
function PendingApplication({ onCorrect }: { onCorrect: () => void }) {
  return (
    <FormScreen>
      <View className="gg-page gap-8 pb-16 pt-4">
        <View className="gap-3">
          <StatusChip tone="info" label="With Operations" icon="clock" />
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            Application sent
          </Text>
          <Text className="text-body-lg text-text-secondary">
            Operations is checking your details and documents. You keep ordering as you do now
            until they decide, and GRIDGO tells you in Notifications when they have.
          </Text>
        </View>
        <View className="gg-card gap-2">
          <Text className="text-body-lg font-medium text-text-primary">Need to fix something?</Text>
          <Text className="text-body text-text-muted">
            If Operations asked for a document, or you applied before documents were needed, send
            the full application again. It replaces the one waiting.
          </Text>
        </View>
        <View className="gap-3">
          <PrimaryButton label="Back to account" onPress={() => router.back()} />
          <SecondaryButton label="Send it again with documents" onPress={onCorrect} />
        </View>
      </View>
    </FormScreen>
  );
}
