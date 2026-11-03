import { gridgoPriceLabel } from "@/components/GridgoPrice";
import { SecondaryButton } from "@/components/SecondaryButton";
import type { CatalogItem } from "@/lib/api";
import { sampleOffer } from "@/lib/sampleFirst";
import { useServiceFeeRateBps } from "@/store/platformSettings";

/**
 * "Order a sample first" beside a match card whose shop offers one
 * (gridgo-api#222). A sample still needs the batch's options, so it opens the
 * listing sheet with the sample leading; nothing is added from here.
 *
 * Under the card rather than inside it: the card is a button already, and a
 * button inside a button is one target to a screen reader.
 */
export function SampleOfferButton({
  listing,
  onPress,
}: {
  listing: Pick<CatalogItem, "sampleAvailable" | "samplePriceMinor" | "clientSamplePriceMinor">;
  onPress: () => void;
}) {
  const rate = useServiceFeeRateBps();
  const offer = sampleOffer(listing);
  if (!offer) return null;
  return (
    <SecondaryButton
      label={`Order a sample first · ${gridgoPriceLabel(offer.supplierMinor, rate, offer.clientMinor)}`}
      onPress={onPress}
    />
  );
}
