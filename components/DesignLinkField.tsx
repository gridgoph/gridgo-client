import {
  Box,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  HardDrive,
  Link2,
  LoaderCircle,
  Palette,
  PenTool,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  CANVA_SHARE_STEPS,
  OTHER_SHARE_STEPS,
  providerName,
  providerOf,
  type LinkProvider,
  type LinkVerdict,
} from "@/lib/designLink";

const PROVIDER_ICONS: Record<LinkProvider, LucideIcon> = {
  canva: Palette,
  google_drive: HardDrive,
  dropbox: Box,
  figma: PenTool,
  other: Link2,
};

const TONE_ICONS: Record<LinkVerdict["tone"], LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

/** A paste lands as one change of many characters; typing never does. */
const PASTE_JUMP = 8;

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  /** Paste, leaving the field, or the keyboard's Done. */
  onCommit: (text: string) => void;
  onClear: () => void;
  onRecheck: () => void;
  /** "a Canva link" — what this listing takes, in `designLinkPhrase`'s words. */
  phrase: string;
  /** Whether to teach Canva's own Share menu, or generic sharing. */
  takesCanva: boolean;
  checking: boolean;
  saving: boolean;
  verdict: LinkVerdict | null;
  /** The address itself is wrong: no round trip was made. */
  inputError: string | null;
  saveError: string | null;
  /** On the line, with no check this session (a return visit, or an API with no check). */
  savedUnchecked: boolean;
};

/**
 * The design-link half of the artwork step: a link instead of a file.
 *
 * One field, and under it one answer. The answer is the thing a client came
 * for — does the print shop's side of GRIDGO see my design — so it is set as a
 * sentence with its own mark and colour (never colour alone), and it is quiet
 * when there is nothing to say. The share steps are folded away: most people
 * paste a link that already works, and the ones who need them are pointed at
 * them by a sign-in answer.
 */
export function DesignLinkField({
  value,
  onChangeText,
  onCommit,
  onClear,
  onRecheck,
  phrase,
  takesCanva,
  checking,
  saving,
  verdict,
  inputError,
  saveError,
  savedUnchecked,
}: Props) {
  const colors = useThemeColors();
  const [showSteps, setShowSteps] = useState(false);
  const provider = value.trim() ? providerOf(/^https?:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`) : null;
  const ProviderIcon = PROVIDER_ICONS[provider ?? "other"];
  const steps = takesCanva ? CANVA_SHARE_STEPS : OTHER_SHARE_STEPS;
  const stepsOpen = showSteps || verdict?.tone === "error";

  return (
    <View className="gg-card gap-4">
      <View className="flex-row items-center gap-3">
        <View
          aria-hidden
          className="h-10 w-10 items-center justify-center rounded-field bg-surface-variant"
        >
          <ProviderIcon size={20} color={colors.textPrimary} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-body-lg font-medium text-text-primary">Design link</Text>
          <Text className="text-caption text-text-secondary">
            {provider && provider !== "other"
              ? `${providerName(provider)} design`
              : `Paste ${phrase}`}
          </Text>
        </View>
      </View>

      <View className="gg-field flex-row items-center">
        <TextInput
          value={value}
          onChangeText={(next) => {
            onChangeText(next);
            if (next.trim() && next.length - value.length >= PASTE_JUMP) onCommit(next);
          }}
          onEndEditing={(event) => onCommit(event.nativeEvent.text ?? value)}
          onSubmitEditing={(event) => onCommit(event.nativeEvent.text ?? value)}
          placeholder={takesCanva ? "https://www.canva.com/design/…" : "https://…"}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Design link"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          returnKeyType="done"
          className="min-w-0 flex-1 text-body text-text-primary"
          style={{ paddingStart: 16, paddingEnd: 8, includeFontPadding: false }}
        />
        {value ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Remove the design link"
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <X size={18} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <LinkAnswer
        checking={checking}
        saving={saving}
        verdict={verdict}
        inputError={inputError}
        saveError={saveError}
        savedUnchecked={savedUnchecked}
        onRecheck={onRecheck}
      />

      <View className="border-t border-outline-subtle pt-1">
        <Pressable
          onPress={() => setShowSteps((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: stepsOpen }}
          accessibilityLabel={takesCanva ? "How to share from Canva" : "How to share a design link"}
          className="gg-touch flex-row items-center justify-between"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-body font-medium text-text-primary">
            {takesCanva ? "How to share from Canva" : "How to share a design link"}
          </Text>
          <View style={stepsOpen ? { transform: [{ rotate: "180deg" }] } : undefined}>
            <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
          </View>
        </Pressable>
        {stepsOpen ? (
          <View className="gap-3 pb-1 pt-1">
            {steps.map((step, index) => (
              <View key={step} className="flex-row items-start gap-3">
                <View className="h-6 w-6 items-center justify-center rounded-pill border border-outline">
                  <Text className="text-caption font-medium text-text-primary">{index + 1}</Text>
                </View>
                <Text className="min-w-0 flex-1 pt-0.5 text-body text-text-secondary">{step}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The one sentence under the field.
 *
 * Priority is what the client can act on first: a wrong address, then the
 * check, then the save. A tinted band with a spine in the tone's colour, so a
 * green "anyone can view" and a red "asks people to sign in" differ in shape
 * of mark and words as well as colour.
 */
function LinkAnswer({
  checking,
  saving,
  verdict,
  inputError,
  saveError,
  savedUnchecked,
  onRecheck,
}: Pick<
  Props,
  "checking" | "saving" | "verdict" | "inputError" | "saveError" | "savedUnchecked" | "onRecheck"
>) {
  const colors = useThemeColors();

  if (inputError) {
    return <Band tone="error" title={inputError} />;
  }
  if (checking) {
    return (
      <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
        <LoaderCircle size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
        <Text className="text-body text-text-secondary">Checking who can open this link…</Text>
      </View>
    );
  }
  if (saveError) {
    return <Band tone="error" title={saveError} action={{ label: "Try again", onPress: onRecheck }} />;
  }
  if (verdict) {
    return (
      <Band
        tone={verdict.tone}
        title={verdict.title}
        body={verdict.body}
        caption={saving ? "Saving…" : null}
        action={verdict.tone === "success" ? undefined : { label: "Check again", onPress: onRecheck }}
      />
    );
  }
  if (saving) {
    return <Text className="text-body text-text-secondary">Saving…</Text>;
  }
  if (savedUnchecked) {
    return (
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-body text-text-secondary">Saved with this item.</Text>
        <Pressable
          onPress={onRecheck}
          accessibilityRole="button"
          accessibilityLabel="Check the link"
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-body font-medium text-text-primary underline">Check link</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Text className="text-caption text-text-muted">
      GRIDGO opens the link to check that anyone with it can see your design. Nobody signs in to
      your account.
    </Text>
  );
}

function Band({
  tone,
  title,
  body,
  caption,
  action,
}: {
  tone: LinkVerdict["tone"];
  title: string;
  body?: string | null;
  caption?: string | null;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useThemeColors();
  const color = colors[tone];
  const Icon = TONE_ICONS[tone];

  return (
    <View className="flex-row overflow-hidden rounded-field">
      <View
        pointerEvents="none"
        className="absolute inset-0"
        style={{ backgroundColor: color, opacity: 0.1 }}
      />
      <View style={{ width: 3, backgroundColor: color }} />
      <View className="min-w-0 flex-1 gap-1 py-3 pe-3 ps-3">
        <View
          className="flex-row items-start gap-3"
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={[title, body, caption].filter(Boolean).join(" ")}
        >
          <View className="pt-0.5">
            <Icon size={18} color={color} strokeWidth={2} aria-hidden />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-medium text-text-primary">{title}</Text>
            {body ? <Text className="text-caption text-text-secondary">{body}</Text> : null}
            {caption ? <Text className="text-caption text-text-muted">{caption}</Text> : null}
          </View>
        </View>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className="ms-[30px] min-h-11 justify-center self-start"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="text-body font-medium text-text-primary underline">
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
