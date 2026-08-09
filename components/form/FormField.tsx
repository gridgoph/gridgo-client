import type { ReactNode } from "react";
import { Text, View } from "react-native";

type Props = {
  label: string;
  children: ReactNode;
  /** Explains the field before the client can get it wrong. */
  helper?: string | null;
  /** What is wrong and how to fix it. Replaces the helper when present. */
  error?: string | null;
  /** Marked so a client knows what they may skip. */
  optional?: boolean;
};

/**
 * One labelled control, with a single line underneath that either explains the
 * field or says what to fix.
 *
 * A label labels and helper text explains — neither does the other's job — and
 * every field on a screen keeps the same vertical rhythm.
 */
export function FormField({ label, children, helper, error, optional }: Props) {
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline gap-2">
        <Text className="text-caption text-text-muted">{label}</Text>
        {optional ? <Text className="text-caption text-text-muted">Optional</Text> : null}
      </View>
      {children}
      {error ? (
        <Text className="text-caption text-error">{error}</Text>
      ) : helper ? (
        <Text className="text-caption text-text-muted">{helper}</Text>
      ) : null}
    </View>
  );
}

/**
 * Eyebrow above a group of fields. Only used where the grouping is real —
 * what the job is, when it is due, where it goes.
 */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-4">
      <Text className="text-overline text-text-muted">{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}
