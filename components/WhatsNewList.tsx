import { Text, View } from "react-native";

import { APP_UPDATE_COPY } from "@/lib/appUpdate";

type Props = {
  versionName: string;
  /** Already plain and capped by `parseWhatsNew`. */
  items: string[];
};

/**
 * "What's new in 1.0.x", as the release wrote it. Shared by the update sheet
 * and the Notifications card so both say the same thing. Draws nothing for a
 * release with no notes, which leaves either surface as it was before notes
 * existed.
 */
export function WhatsNewList({ versionName, items }: Props) {
  if (items.length === 0) return null;
  const title = APP_UPDATE_COPY.whatsNewTitle(versionName);

  return (
    <View accessible accessibilityLabel={`${title}: ${items.join(". ")}`} className="gap-2">
      <Text className="text-body font-bold text-text-primary">{title}</Text>
      {items.map((item, index) => (
        <View key={`${index}-${item}`} className="flex-row gap-2">
          <Text className="text-body text-text-muted">{"•"}</Text>
          <Text className="flex-1 text-body text-text-secondary">{item}</Text>
        </View>
      ))}
    </View>
  );
}
