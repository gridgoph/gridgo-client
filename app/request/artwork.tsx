import { FileCheck, TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { KEYBOARD_CARET_GAP } from "@/components/FormScreen";
import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { ErrorScreenState } from "@/components/ErrorState";
import { ProductPreview } from "@/components/ProductPreview";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StepTrailBar } from "@/components/StepTrail";
import { useArtworkUpload, type FormatGuard } from "@/hooks/useArtworkUpload";
import {
  applyDetectedPages,
  detectedProportions,
  detectedSummary,
  missingPageCountMessage,
  pageCountOffer,
} from "@/lib/artworkUpload";
import {
  artworkPrintSizeWarning,
  measuredSizeMilli,
  physicalSizeMilli,
  printResolution,
} from "@/lib/printResolution";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  artworkFitWarning,
  fileFormats,
  fileMatchesFormats,
  formatSentence,
  linkFormats,
  pickerMimeTypes,
} from "@/lib/listing";
import { orderFlowNow } from "@/lib/orderFlow";
import { type OrderStepId } from "@/lib/orderSteps";
import { MOCKUP_LABEL } from "@/lib/productPreview";
import { useCart } from "@/store/cart";

/**
 * The artwork for one thing in the basket.
 *
 * Only what this listing takes. A shop that prints flyers from JPEG, PNG and
 * PDF has said so on its board, and the picker is narrowed to exactly that — a
 * client who chooses a Photoshop file finds out here, in the shop's own words,
 * rather than after sending 180 MB over mobile data.
 *
 * An image is shown on the product. A PDF or a link is not: nothing on this
 * phone can rasterise a PDF, and a drawn rectangle standing in for one would be
 * a picture of a file GRIDGO has not looked at. That case gets the file named
 * instead, which is the honest version of the same reassurance.
 *
 * A size that does not match the sheet is a warning and never a block. A client
 * printing an A5 design on A4 with a border is doing something deliberate, and
 * a shop can trim; the far commoner case is a phone screenshot sent for a
 * flyer, and that is worth one sentence before it is printed rather than after.
 */
export default function ArtworkScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { lineId } = useLocalSearchParams<{ lineId?: string }>();

  const cart = useCart((state) => state.cart);
  const run = useCart((state) => state.run);
  const adopt = useCart((state) => state.adopt);
  const line = cart?.lines.find((entry) => entry.id === lineId) ?? null;
  const item = line?.listing ?? null;

  // The pixels belong to one file; a different file, or a server answer,
  // simply stops them being used rather than needing them cleared.
  const [measuredPixels, setMeasuredPixels] = useState<{
    fileId: string;
    size: { width: number; height: number };
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pagesDraft, setPagesDraft] = useState<string | null>(null);

  /**
   * The picker filter and its refusal, in the shop's words. Rebuilt only when
   * the listing changes; the upload hook holds on to it across renders.
   */
  const guard: FormatGuard | undefined = useMemo(() => {
    if (!item) return undefined;
    const uploads = fileFormats(item);
    const links = linkFormats(item);
    if (!uploads.length) return undefined;
    return {
      accept: pickerMimeTypes(item),
      check: (fileName, mimeType) => fileMatchesFormats(item, fileName, mimeType),
      rejection: (fileName) =>
        `${item.name} takes ${formatSentence(uploads)}` +
        `${links.length ? `, or a link from ${formatSentence(links)}` : ""}. ` +
        `${fileName} is none of those — export it and pick it again.`,
    };
  }, [item]);

  const upload = useArtworkUpload({ fileId: line?.artworkFileId }, guard);

  // Put the file on the basket line as soon as GRIDGO holds it, so leaving this
  // screen after a successful upload never loses what was just sent. A per-page
  // listing also takes the file's own page count in that same write — waiting
  // for a tap is how a 30-page document was billed as one page. Later edits
  // stay: this runs only while the file is not yet on the line.
  const stored = upload.state.fileId;
  useEffect(() => {
    if (!line || !stored || stored === line.artworkFileId || saving) return;
    const pages = applyDetectedPages(upload.state.detected, item?.pricingUnit);
    void (async () => {
      setSaving(true);
      setSaveError(null);
      try {
        const updated = await run((cartId) =>
          api.updateCartLine(cartId, line.id, {
            artworkFileId: stored,
            ...(pages != null ? { measurement: { pages } } : {}),
          }),
        );
        adopt(updated);
      } catch (error) {
        setSaveError(
          userFacingError(
            error,
            "Your file reached GRIDGO but did not go onto this item. Try again in a moment.",
          ),
        );
      } finally {
        setSaving(false);
      }
    })();
  }, [stored, upload.state.detected, line?.id, line?.artworkFileId, item?.pricingUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Take the file's page count as the quantity, when the client asks for it.
   *
   * The same save path the artwork itself takes, for the same reason: the cart
   * lives on GRIDGO, and the response is the basket rather than something to
   * re-read afterwards.
   */
  const setPageCount = useCallback(
    async (pages: number) => {
      if (!line || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        adopt(
          await run((cartId) =>
            // The page count is the measurement, not the quantity: quantity is
            // how many copies of the document, and writing pages there would
            // bill ten copies of a one-page job.
            api.updateCartLine(cartId, line.id, { measurement: { pages } }),
          ),
        );
      } catch (error) {
        setSaveError(
          userFacingError(error, "That page count did not save. Try again in a moment."),
        );
      } finally {
        setSaving(false);
      }
    },
    [line?.id, saving], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * The artwork's own proportions.
   *
   * GRIDGO reads these out of the bytes as they are uploaded, which is both
   * better and cheaper than what this screen used to do: a PDF now answers
   * (nothing on this phone can open one), the answer is the printed size
   * rather than a pixel count, and it costs no round trip.
   *
   * Downloading the file to measure it is kept only for the case the server
   * cannot answer — a raster that declared no density. Its pixels still settle
   * a proportion even though they settle no physical size.
   */
  const detected = upload.state.detected;
  const measured = detectedProportions(detected);

  const measure = useCallback((fileId: string | null) => {
    if (!fileId) return;
    api
      .getFileDownloadUrl(fileId)
      .then(({ url }) => {
        Image.getSize(
          url,
          (width, height) => setMeasuredPixels({ fileId, size: { width, height } }),
          () => setMeasuredPixels(null),
        );
      })
      .catch(() => setMeasuredPixels(null));
  }, []);

  useEffect(() => {
    if (!measured) measure(stored ?? null);
  }, [stored, measure, measured]);

  const pixels = !measured && stored && measuredPixels?.fileId === stored ? measuredPixels.size : null;

  /** Back to the shop board, or to the sheet this file belongs to. */
  const goStep = (step: OrderStepId) => {
    if (step === "shop") {
      const flow = orderFlowNow();
      if (!flow) {
        router.navigate("/request/category");
        return;
      }
      router.navigate({
        pathname: "/request/match",
        params: { subcategory: flow.subcategoryCode, category: flow.categoryCode },
      });
      return;
    }
    if (step === "listing" && line) {
      router.navigate({
        pathname: "/request/listing",
        params: { itemId: line.catalogItemId, lineId: line.id },
      });
    }
  };

  if (!line) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorScreenState
          label="That item is no longer in your order"
          body="It was removed, or the order was placed. Go back and pick what you are printing."
          retryLabel="Back"
          onRetry={() => router.replace("/(tabs)/home")}
        />
      </Screen>
    );
  }

  const size = typeof line.structuredSpec.size === "string" ? line.structuredSpec.size : "";
  const summary = detectedSummary(detected);

  /*
    The one thing this screen has been unable to answer.

    It has had the chosen size all along, and now it has the file's real pixel
    dimensions, so "will this print sharp" stops being a guess from the byte
    count. 540 x 720 pixels on A5 is 87 DPI whatever the file weighs, and a
    38 KB warning that happened to be right about it was right by accident.

    Both halves can be unknown — a custom size nobody has measured, or a PDF,
    which states a physical size rather than a pixel count and has nothing to
    divide. Then this is null and the byte-count note stands as before.
  */
  const filePixels =
    detected?.pixelWidth && detected?.pixelHeight
      ? { width: detected.pixelWidth, height: detected.pixelHeight }
      : pixels;
  /*
    Two ways a line knows how big it is, and a measured listing has no size
    label at all: a tarpaulin billed by the square foot was typed as 3 by 5
    feet, not picked as "A4". Without this the resolution check goes blind on
    exactly the jobs where it matters most — a banner is the largest thing
    GRIDGO prints and the easiest to send a screenshot for.
  */
  const orderedSize =
    measuredSizeMilli(line.measurement, item?.measureUnit) ??
    physicalSizeMilli(size, { subcategoryCode: item?.subcategoryCode });
  const resolution = printResolution(filePixels, orderedSize);
  const printSizeWarning = artworkPrintSizeWarning(detected, orderedSize, size);
  const warning = printSizeWarning
    ? { message: printSizeWarning, blocking: false as const }
    : artworkFitWarning(size, measured ?? pixels, orderedSize);
  const pageOffer = pageCountOffer(detected, item?.pricingUnit, line.measurement?.pages);
  const unreadPages = missingPageCountMessage(
    detected,
    item?.pricingUnit,
    line.measurement?.pages,
    upload.state.contentType,
  );
  const onLine = Boolean(line.artworkFileId);
  const canCheckout = onLine && !saving && !unreadPages;
  const asksPages = item?.pricingUnit === "per_page";
  const links = item ? linkFormats(item) : [];
  const uploads = item ? fileFormats(item) : [];
  const name = item?.name ?? "this item";

  return (
    <Screen edges={["bottom"]}>
      <StepTrailBar current="artwork" onStep={goStep} />

      <KeyboardAwareScrollView
        className="gg-screen"
        contentContainerClassName="gg-page pb-8 pt-4"
        bottomOffset={KEYBOARD_CARET_GAP}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-h1 text-text-primary">Your artwork</Text>
        <Text className="mt-3 text-body-lg text-text-secondary">
          For {name}
          {size ? ` · ${size}` : ""}.
        </Text>

        <View className="mt-6">
          {/*
            Until a file lands this card is the only thing on the screen a
            client can act on, so it carries the screen's yellow and takes the
            tap itself. Once the file is on the line it goes quiet and the
            yellow moves to "Go to checkout" below.
          */}
          <ArtworkUploadCard
            state={upload.state}
            onPick={() => void upload.pick()}
            onRetry={() => void upload.retry()}
            onCancel={upload.cancel}
            emphasis="primary"
            resolution={resolution}
          />
        </View>

        {saveError ? <Text className="mt-3 text-body text-error">{saveError}</Text> : null}

        {/*
          What the file itself says it is. This is a verification line, not a
          decoration: a client who exported the wrong artboard finds out here,
          before paying, rather than when the job comes back the wrong size.
          It is deliberately quiet — it confirms rather than asks — and it is
          absent entirely when the file said nothing, because an empty
          confident sentence is worse than no sentence.
        */}
        {summary ? (
          <View className="mt-3 flex-row items-start gap-2">
            <View className="pt-0.5">
              <FileCheck
                size={14}
                color={colors.textMuted}
                strokeWidth={2}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
            <Text className="min-w-0 flex-1 text-caption text-text-muted">
              We read this as {summary}.
            </Text>
          </View>
        ) : null}

        {/*
          A ten-page document priced by the page, ordered as one page. GRIDGO
          knows the number by the time the file lands, so it offers it — as an
          offer, because a client may deliberately want two pages of a ten-page
          file, and a quantity that rewrites itself is a total nobody chose.

          The offer is a quiet control, not the screen's yellow: the yellow
          belongs to the upload card until there is a file and to checkout
          after, and a third loud thing here would make all three quiet.
        */}
        {asksPages ? (
          <View className="mt-4 gap-2">
            <Text className="text-overline text-text-muted">HOW MANY PAGES</Text>
            <View className="gg-field flex-row items-center">
              <TextInput
                value={
                  pagesDraft ??
                  (line.measurement?.pages == null ? "" : String(line.measurement.pages))
                }
                onChangeText={(text) => setPagesDraft(text.replace(/[^0-9]/g, ""))}
                onEndEditing={(event) => {
                  const next = Number.parseInt(event.nativeEvent.text, 10);
                  setPagesDraft(null);
                  if (Number.isSafeInteger(next) && next > 0 && next !== line.measurement?.pages) {
                    void setPageCount(next);
                  }
                }}
                keyboardType="number-pad"
                placeholder="0"
                accessibilityLabel="How many pages"
                className="min-w-0 flex-1 text-body-lg text-text-primary"
                style={{ paddingStart: 16, paddingEnd: 8, includeFontPadding: false }}
              />
              <Text className="pe-4 text-body text-text-muted">pages</Text>
            </View>
            {unreadPages ? (
              <Text className="text-body text-error">{unreadPages}</Text>
            ) : (
              <Text className="text-caption text-text-secondary">
                Copies are set at checkout. This is how many pages each copy has.
              </Text>
            )}
          </View>
        ) : null}

        {pageOffer ? (
          <View className="mt-4 gap-2 rounded-field border border-outline bg-surface p-3">
            <Text className="text-body font-medium text-text-primary">
              Print all {pageOffer.pages} pages?
            </Text>
            <Text className="text-caption text-text-secondary">{pageOffer.message}</Text>
            <SecondaryButton
              label={`Use ${pageOffer.pages} pages`}
              onPress={() => void setPageCount(pageOffer.pages)}
              disabled={saving}
            />
          </View>
        ) : null}

        {item && !uploads.length && links.length ? (
          <Text className="mt-3 text-body text-text-secondary">
            GRIDGO takes {formatSentence(links)} for this rather than an upload. Place the order and
            Operations will ask you for the link.
          </Text>
        ) : null}

        {onLine ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">HOW IT WOULD LOOK</Text>
            <ProductPreview
              subcategoryCode={item?.subcategoryCode}
              artworkFileId={line.artworkFileId}
              artworkName={upload.state.fileName || name}
              productName={name}
              size={size || null}
            />
            <Text className="text-caption text-text-muted">{MOCKUP_LABEL}</Text>
          </View>
        ) : null}

        {warning ? (
          <View className="mt-6 flex-row items-start gap-3 rounded-field border border-warning bg-surface p-3">
            <View className="pt-0.5">
              <TriangleAlert
                size={16}
                color={colors.warning}
                strokeWidth={2}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body font-medium text-text-primary">
                Check the size before you send this
              </Text>
              <Text className="text-caption text-text-secondary">{warning.message}</Text>
            </View>
          </View>
        ) : null}

        {/*
          Drawn only once there is a file to take to checkout. A disabled yellow
          slab under a card with no way to fill it was the whole of the reported
          problem: the screen's one loud control did nothing, and the control
          that would have done something did not exist.
        */}
        {onLine ? (
          <Pressable
            onPress={() => router.replace("/checkout")}
            disabled={!canCheckout}
            accessibilityRole="button"
            accessibilityLabel="Go to checkout"
            accessibilityState={{ disabled: !canCheckout }}
            className={!canCheckout ? "gg-btn-primary gg-disabled mt-8" : "gg-btn-primary mt-8"}
            style={({ pressed }) => (pressed && canCheckout ? { opacity: 0.9 } : undefined)}
          >
            <Text className="text-button text-action-yellow-on">
              {saving ? "Saving…" : "Go to checkout"}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => router.replace("/request/category")}
          accessibilityRole="button"
          accessibilityLabel="Add something else to print"
          className="gg-touch mt-6 items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-body text-text-secondary underline">
            Add something else first
          </Text>
        </Pressable>

        {!onLine ? (
          <Text className="mt-4 text-center text-caption text-text-muted">
            GRIDGO needs the file before it can print this.
          </Text>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
