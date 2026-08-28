import { TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { ErrorScreenState } from "@/components/ErrorState";
import { ProductPreview } from "@/components/ProductPreview";
import { StepTrailBar } from "@/components/StepTrail";
import { useArtworkUpload, type FormatGuard } from "@/hooks/useArtworkUpload";
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

  const [pixels, setPixels] = useState<{ width: number; height: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
  // screen after a successful upload never loses what was just sent.
  const stored = upload.state.fileId;
  useEffect(() => {
    if (!line || !stored || stored === line.artworkFileId || saving) return;
    setSaving(true);
    setSaveError(null);
    void (async () => {
      try {
        const updated = await run((cartId) =>
          api.updateCartLine(cartId, line.id, { artworkFileId: stored }),
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
  }, [stored, line?.id, line?.artworkFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The artwork's own proportions, read from the stored file.
   *
   * Only images answer. A PDF fails here and simply produces no warning, which
   * is right — GRIDGO has not seen inside it and must not claim it is the wrong
   * shape.
   */
  const measure = useCallback((fileId: string | null) => {
    setPixels(null);
    if (!fileId) return;
    api
      .getFileDownloadUrl(fileId)
      .then(({ url }) => {
        Image.getSize(
          url,
          (width, height) => setPixels({ width, height }),
          () => setPixels(null),
        );
      })
      .catch(() => setPixels(null));
  }, []);

  useEffect(() => {
    measure(stored ?? null);
  }, [stored, measure]);

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
  const warning = artworkFitWarning(size, pixels);
  const onLine = Boolean(line.artworkFileId);
  const links = item ? linkFormats(item) : [];
  const uploads = item ? fileFormats(item) : [];
  const name = item?.name ?? "this item";

  return (
    <Screen edges={["bottom"]}>
      <StepTrailBar current="artwork" onStep={goStep} />

      <ScrollView className="gg-screen" contentContainerClassName="gg-page pb-8 pt-4">
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
          />
        </View>

        {saveError ? <Text className="mt-3 text-body text-error">{saveError}</Text> : null}

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
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Go to checkout"
            accessibilityState={{ disabled: saving }}
            className={saving ? "gg-btn-primary gg-disabled mt-8" : "gg-btn-primary mt-8"}
            style={({ pressed }) => (pressed && !saving ? { opacity: 0.9 } : undefined)}
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
      </ScrollView>
    </Screen>
  );
}
