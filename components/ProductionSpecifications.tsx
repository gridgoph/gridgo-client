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
  const items = orderProductionItems(order);
  // Bare, a single item's name is the job's title already heading the screen.
  const named = !bare || items.length > 1;
  return <View className="gap-3">{items.map((item) => (
    <View key={item.id} className="gap-2">
      {named ? <Text className={bare ? "pt-3 text-body font-medium text-text-primary" : "text-body font-medium text-text-primary"}>{item.itemName}</Text> : null}
      <View className={bare ? undefined : "gg-card-flush px-4"}>
        {productionSpecRows(item, (value) => taxonomyLabel(taxonomy, value)).map((row, index) => <SpecRow key={`${row.label}:${index}`} label={row.label} value={row.value} />)}
        {showLinks ? (item.artworkLinks ?? []).map((link) => <DesignLinkRow key={`${link.formatCode}:${link.url}`} link={link} />) : null}
      </View>
    </View>
  ))}</View>;
}
