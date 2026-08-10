import { Pressable, Text, View } from "react-native";

import { formatUnitPrice, familyLabel } from "@/lib/catalog";
import type { CatalogProduct } from "@/lib/api";

type Props = {
  product: CatalogProduct;
  onPress: () => void;
};

/**
 * Catalog product tile: name, family, base price. Opens a new request.
 */
export function ProductCard({ product, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${formatUnitPrice(product.basePriceMinor, product.unit)}`}
      className="gg-card gg-touch"
    >
      {({ pressed }) => (
        <>
          <Text className="text-overline text-text-muted">{familyLabel(product.family)}</Text>
          <Text className="mt-1 text-body-lg font-medium text-text-primary">{product.name}</Text>
          <Text className="mt-2 text-body text-text-secondary">
            From {formatUnitPrice(product.basePriceMinor, product.unit)}
          </Text>
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" /> : null}
        </>
      )}
    </Pressable>
  );
}
