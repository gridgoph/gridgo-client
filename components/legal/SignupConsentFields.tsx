import { Pressable, Text, View } from "react-native";

import { PrivacyPolicyLink } from "@/components/AccountPrivacy";
import { ErrorState } from "@/components/ErrorState";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { LegalDocumentRow } from "@/components/legal/LegalDocumentRow";
import { SkeletonBlock } from "@/components/Skeleton";
import type { LegalVersion } from "@/lib/api";
import { joinTitles, type SignupConsent } from "@/lib/legal";
import type { LegalLibraryStatus } from "@/store/legalLibrary";

type Props = {
  consent: SignupConsent;
  onChange: (next: SignupConsent) => void;
  /** Terms and Privacy, as GRIDGO has them in effect now. */
  documents: LegalVersion[] | null;
  status: LegalLibraryStatus;
  onRetry: () => void;
  disabled?: boolean;
};

/**
 * What a client agrees to before GRIDGO enrolls them, on the sign-up form and
 * on Finish signing up (where a Google sign-up lands).
 *
 * The documents come first, so the box below them agrees to something the
 * client could see and open. Then the age question — asked, never inferred —
 * with the guardian's box only for someone under 18. The agreement box starts
 * unticked and blocks the button until it is ticked; the news box is separate,
 * optional, and never stands in the way.
 */
export function SignupConsentFields({
  consent,
  onChange,
  documents,
  status,
  onRetry,
  disabled = false,
}: Props) {
  const set = (patch: Partial<SignupConsent>) => onChange({ ...consent, ...patch });
  const titles = documents ? joinTitles(documents) : "Terms of Service and Privacy Notice";

  return (
    <View className="gap-5">
      <View className="gap-3">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Before you join
        </Text>
        {status === "failed" && !documents ? (
          <ErrorState
            label="Could not load GRIDGO's terms"
            body="You need to read them to sign up. Check this phone's connection and try again."
            onRetry={onRetry}
          />
        ) : documents ? (
          <View className="gg-card-flush">
            {documents.map((doc, index) => (
              <LegalDocumentRow key={doc.id} doc={doc} divided={index > 0} />
            ))}
          </View>
        ) : status === "unsupported" ? (
          <PrivacyPolicyLink />
        ) : (
          <View accessibilityLabel="Loading GRIDGO's terms">
            <SkeletonBlock className="h-36 w-full" />
          </View>
        )}
      </View>

      <View className="gap-3" accessibilityRole="radiogroup" accessibilityLabel="Are you 18 or older?">
        <Text className="text-body-lg font-medium text-text-primary">Are you 18 or older?</Text>
        <View className="flex-row gap-3">
          <AgeChoice
            label="Yes"
            selected={consent.adult === true}
            disabled={disabled}
            onPress={() => set({ adult: true, guardian: false })}
          />
          <AgeChoice
            label="No, under 18"
            selected={consent.adult === false}
            disabled={disabled}
            onPress={() => set({ adult: false })}
          />
        </View>
        {consent.adult === false ? (
          <CheckboxRow
            checked={consent.guardian}
            onChange={(guardian) => set({ guardian })}
            disabled={disabled}
            label="My parent or guardian has read these terms and agrees to my using GRIDGO"
            hint="Required for anyone under 18."
          />
        ) : null}
      </View>

      <View className="gap-1">
        <CheckboxRow
          checked={consent.agreed}
          onChange={(agreed) => set({ agreed })}
          disabled={disabled}
          label={`I agree to the ${titles}`}
          hint="Required to create your account."
        />
        <CheckboxRow
          checked={consent.marketing}
          onChange={(marketing) => set({ marketing })}
          disabled={disabled}
          label="Send me GRIDGO news and offers"
          hint="Optional. Leave it unticked and nothing changes about your account."
        />
      </View>
    </View>
  );
}

function AgeChoice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      className={
        selected
          ? "gg-touch flex-1 items-center justify-center rounded-field border-2 border-accent bg-surface-high px-3 py-2"
          : "gg-touch flex-1 items-center justify-center rounded-field border border-outline bg-surface px-3 py-2"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text
        className={
          selected ? "text-body font-bold text-text-primary" : "text-body text-text-secondary"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
