import { EMPTY_TAXONOMY, taxonomyLabel, type Taxonomy } from "@/lib/taxonomy";
import { Text, View } from "react-native";
import { DesignLinkRow } from "@/components/DesignLinkRow";
import { SpecRow } from "@/components/SpecRow";
import type { Order } from "@/lib/api";
import { orderProductionItems, productionSpecRows } from "@/lib/productionSpecs";

type Props = {
  order: Order;
  taxonomy?: Taxonomy;
  /**
   * Rows straight onto the surface they sit in, with no card of their own —
   * the order screen draws them inside a folding section that is the card.
   */
  bare?: boolean;
  /** Design links with each item. The order screen lists them under Artwork. */
  showLinks?: boolean;
};

/** The saved specification for every item, shared by job detail and counter QC. */
export function ProductionSpecifications({ order, taxonomy = EMPTY_TAXONOMY, bare = false, showLinks = true }: Props) {
  return <View className="gap-3">{orderProductionItems(order).map((item) => (
    <View key={item.id} className="gap-2">
      <Text className="text-body font-medium text-text-primary">{item.itemName}</Text>
      <View className={bare ? undefined : "gg-card-flush px-4"}>
        {productionSpecRows(item, (value) => taxonomyLabel(taxonomy, value)).map((row, index) => <SpecRow key={`${row.label}:${index}`} label={row.label} value={row.value} />)}
        {showLinks ? (item.artworkLinks ?? []).map((link) => <DesignLinkRow key={`${link.formatCode}:${link.url}`} link={link} />) : null}
      </View>
    </View>
  ))}</View>;
}
