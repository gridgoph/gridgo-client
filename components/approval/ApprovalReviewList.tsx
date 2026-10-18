import { Text, View } from "react-native";

import type { ApprovalReviewItem } from "@/lib/approvalProof";

/**
 * Exactly what an approval covers, item by item: what it is, how many, the
 * options, the artwork and links, the client's note, and every upload warning
 * they accepted. The same list draws the basket being approved at checkout and
 * the frozen record afterwards, so the two read alike.
 */
export function ApprovalReviewList({ items }: { items: ApprovalReviewItem[] }) {
  if (!items.length) {
    return <Text className="text-body text-text-secondary">GRIDGO kept no item details on this record.</Text>;
  }
  return (
    <View className="gap-3">
      {items.map((item, index) => (
        <View
          key={item.key}
          className={index > 0 ? "gap-1 border-t border-outline-subtle pt-3" : "gap-1"}
        >
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{item.name}</Text>
            <Text className="text-caption text-text-secondary">{item.quantity}</Text>
          </View>
          {item.specs.length ? (
            <Text className="text-caption text-text-secondary">{item.specs.join(" · ")}</Text>
          ) : null}
          {item.artwork.length ? (
            item.artwork.map((line, at) => (
              <Text key={`${line}-${at}`} className="text-caption text-text-secondary" numberOfLines={1}>
                {line}
              </Text>
            ))
          ) : (
            <Text className="text-caption text-text-muted">No artwork attached</Text>
          )}
          {item.instructions ? (
            <Text className="text-caption text-text-secondary">Note: {item.instructions}</Text>
          ) : null}
          {item.acceptedWarnings.map((line) => (
            <Text key={line} className="text-caption text-warning">
              {line}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
