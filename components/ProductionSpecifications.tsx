import { CircleCheck } from "lucide-react-native";
import { EMPTY_TAXONOMY, taxonomyLabel, type Taxonomy } from "@/lib/taxonomy";
import { Text, View } from "react-native";
import { ColourEvidence } from "@/components/ColourEvidence";
import { DesignLinkRow } from "@/components/DesignLinkRow";
import { SpecRow } from "@/components/SpecRow";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { cleanLabel, lineAttachments } from "@/lib/artworkAttachments";
import { itemNote } from "@/lib/orderChanges";
import { orderProductionItems, productionSpecRows } from "@/lib/productionSpecs";
import { formatTimelineStamp } from "@/lib/relativeTime";

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
  const readAt = order.specialInstructionsAcknowledgement?.at ?? null;
  return <View className="gap-3">{items.map((item) => {
    const { note, agreed } = itemNote(item);
    return (
      <View key={item.id} className="gap-2">
        {named ? <Text className={bare ? "pt-3 text-body font-medium text-text-primary" : "text-body font-medium text-text-primary"}>{item.itemName}</Text> : null}
        <View className={bare ? undefined : "gg-card-flush px-4"}>
          {productionSpecRows(item, (value) => taxonomyLabel(taxonomy, value)).map((row, index) => <SpecRow key={`${row.label}:${index}`} label={row.label} value={row.value} />)}
          <ColourEvidence item={item} />
          {note ? <NoteRow label="Special instructions" text={note} readAt={readAt} /> : null}
          {agreed ? <NoteRow label="Agreed change" text={agreed} /> : null}
          {showLinks
            ? lineAttachments(item).flatMap((entry) =>
                entry.kind === "link"
                  ? [<DesignLinkRow key={`${entry.formatCode}:${entry.url}`} link={entry} name={cleanLabel(entry.label)} />]
                  : [],
              )
            : null}
        </View>
      </View>
    );
  })}</View>;
}

/**
 * A written note in a specification: too long for a label-and-value row, so
 * it reads as a paragraph under its label. A special instruction also says
 * whether the shop has ticked that it read it.
 */
/** `readAt`: when the shop ticked it; null while it has not; omitted for a note no shop ticks. */
export function NoteRow({ label, text, readAt }: { label: string; text: string; readAt?: string | null }) {
  const colors = useThemeColors();
  return (
    <View className="gap-1 border-b border-outline-subtle py-3">
      <Text className="text-body text-text-secondary">{label}</Text>
      <Text className="text-body text-text-primary">{text}</Text>
      {readAt ? (
        <View className="flex-row items-center gap-1.5 pt-1" accessible accessibilityLabel={`The shop ticked that it read this, ${formatTimelineStamp(readAt)}`}>
          <CircleCheck size={14} color={colors.success} strokeWidth={2} aria-hidden />
          <Text className="text-caption text-text-secondary">
            The shop ticked that it read this · {formatTimelineStamp(readAt)}
          </Text>
        </View>
      ) : readAt === null ? (
        <Text className="pt-1 text-caption text-text-muted">The shop reads this and ticks it before it accepts the job.</Text>
      ) : null}
    </View>
  );
}
