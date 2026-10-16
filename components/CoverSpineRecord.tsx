import { useEffect } from "react";
import { Text, View } from "react-native";

import { BookPreview } from "@/components/BookPreview";
import { SpecRow } from "@/components/SpecRow";
import type { ProductionItem } from "@/lib/api";
import { coverSpineRows, spineLines } from "@/lib/coverSpine";
import { useArtworkAttachments } from "@/store/artworkAttachments";

/**
 * The cover and spine agreed at checkout, per item, as the order and the
 * artwork proof show them: how the cover is made, the spine on one line, and
 * the book drawn the way it was agreed. An item whose product asked and was
 * given nothing reads "Not given"; the shop asks the client then. Draws
 * nothing for an order without a hardbound item.
 */
export function CoverSpineRecord({
  items,
  bare = false,
  title,
}: {
  items: ProductionItem[];
  /** A heading inside the card, where the record stands on its own. */
  title?: string;
  /** Straight onto the surface it sits in, without a card of its own. */
  bare?: boolean;
}) {
  const asked = items.filter((item) => item.coverSpine != null);
  // The cover page's own file name, read once and shared with the artwork step.
  const files = useArtworkAttachments((state) => state.files);
  const coverFileIds = asked.flatMap((item) =>
    item.coverSpine?.status === "given" && item.coverSpine.coverFileId ? [item.coverSpine.coverFileId] : [],
  );
  useEffect(() => {
    for (const fileId of coverFileIds) void useArtworkAttachments.getState().readFile(fileId);
  }, [coverFileIds.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!asked.length) return null;
  const several = items.length > 1;
  return (
    <View className={bare ? "gap-1" : "gg-card gap-3"}>
      {title && !bare ? <Text className="text-h3 text-text-primary">{title}</Text> : null}
      {asked.map((item) => {
        const record = item.coverSpine;
        const rows = coverSpineRows(record) ?? [];
        const given = record?.status === "given" ? record : null;
        const fileName = given?.coverFileId ? files[given.coverFileId]?.originalFilename ?? null : null;
        return (
          <View key={item.id} className="gap-2">
            {several ? <Text className="pt-3 text-body font-medium text-text-primary">{item.itemName}</Text> : null}
            <View>
              {rows.map((row) => (
                <SpecRow key={row.label} label={row.label} value={row.value} />
              ))}
            </View>
            {given ? (
              <View className="py-3">
                <BookPreview
                  cover={given.cover}
                  agreed
                  coverFileName={fileName}
                  lines={spineLines({
                    institutionCode: given.spine.institutionCode ?? "",
                    title: given.spine.title,
                    author: given.spine.author,
                    month: given.spine.month,
                    year: String(given.spine.year),
                  })}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
