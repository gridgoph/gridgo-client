import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { ClientHeaderActions } from "@/components/ClientHeaderActions";

type Props = {
  /** Screen name. Ignored when `children` is passed. */
  title?: string;
  /** Identity lockup (Home) or anything else that replaces the title. */
  children?: ReactNode;
};

/**
 * The row at the top of every client tab: identity on the left, cart and
 * chat on the right.
 *
 * Home supplies the GRIDGO lockup as `children`. The other tabs pass a
 * title. The actions never change, so a client who learns the pair on
 * Home still has them on Orders.
 */
export function ScreenHeader({ title, children }: Props) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 justify-center">
        {children ?? (
          <Text className="text-h1 text-text-primary" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      <ClientHeaderActions />
    </View>
  );
}
