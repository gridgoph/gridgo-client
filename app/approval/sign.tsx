import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SignaturePad } from "@/components/SignaturePad";
import { APPROVAL_MEANING, APPROVAL_STATEMENT } from "@/lib/approvalProof";
import { signatureIsBlank, type Signature } from "@/lib/signature";
import { useApproval } from "@/store/approval";

/**
 * Signing an approval by hand (gridgo-client#248).
 *
 * A page of its own, with nothing on it that scrolls: on a scrolling sheet a
 * downstroke and a scroll are the same gesture, and one of them loses. The
 * client signs under the one sentence GRIDGO records, keeps the signature,
 * and goes back to the screen that asked — checkout, or the sample approval —
 * which shows it and sends it with the approval.
 *
 * `scope` is what is being approved (`store/approval.ts`); `reviewed` is the
 * basket version or review fingerprint the client was looking at.
 */
export default function SignApprovalScreen() {
  const router = useRouter();
  const { scope, reviewed } = useLocalSearchParams<{ scope?: string; reviewed?: string }>();
  const held = useApproval((state) => (scope ? state.drafts[scope]?.signature ?? null : null));
  // A fresh page every time: signing again starts on clean paper.
  const [signature, setSignature] = useState<Signature | null>(null);
  const blank = signatureIsBlank(signature);
  const tooShort = Boolean(signature?.strokes.length) && blank;

  const keep = () => {
    if (!scope || !reviewed || !signature || blank) return;
    useApproval.getState().sign(scope, reviewed, signature);
    router.back();
  };

  return (
    <Screen edges={["bottom"]}>
      <View className="gg-page flex-1 gap-4 pb-4 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">{APPROVAL_STATEMENT}</Text>
          <Text className="text-body text-text-secondary">{APPROVAL_MEANING}</Text>
        </View>

        <SignaturePad value={signature} onChange={setSignature} height={220} />

        <Text
          className={tooShort ? "text-caption text-error" : "text-caption text-text-muted"}
          accessibilityLiveRegion="polite"
        >
          {tooShort
            ? "That is too short to be a signature. Sign your name in the box."
            : held
              ? "Signing again replaces the signature you gave before."
              : "Sign the way you sign a document. Only you can give this approval."}
        </Text>

        <View className="flex-1" />

        <View className="gap-3">
          <PrimaryButton label="Use this signature" disabled={blank || !scope || !reviewed} onPress={keep} />
          <SecondaryButton
            label="Clear and sign again"
            disabled={!signature?.strokes.length}
            onPress={() => setSignature(null)}
          />
        </View>
      </View>
    </Screen>
  );
}
