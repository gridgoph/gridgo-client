import { useState } from "react";
import { Image, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { Sheet } from "@/components/Sheet";
import { images } from "@/constants/images";
import { formatPhp, notificationImageUrl } from "@/lib/api";
import { PAYMENT_CHOICE_BLURB } from "@/lib/checkout";
import {
  SAVE_QR_A11Y,
  SAVE_QR_LABEL,
  savePaymentQrToPhotos,
  saveQrMessage,
} from "@/lib/savePaymentQr";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The 75% this scan is for. Null while GRIDGO cannot yet total the basket. */
  downpaymentMinor: number | null;
  /** Defaults to checkout wording; final payments reuse the same receiving QR. */
  paymentKind?: "checkout" | "initial" | "final";
  /**
   * Public plate from `GET /settings` `paymentQr.imageUrl`. Missing or empty
   * uses the bundled GCash screenshot — never a blank plate.
   */
  imageUrl?: string | null;
};

/** Native ratio of GRIDGO's GCash InstaPay plate (1050×2048). Not a square tile. */
export const GCASH_QR_ASPECT_RATIO = 1050 / 2048;

/** Matches `QrPaySheet`'s `Sheet maxHeightRatio` — the plate must shrink to this. */
export const QR_PAY_SHEET_MAX_HEIGHT_RATIO = 0.9;

/** Horizontal padding of the sheet body (`px-4` on both sides) plus crop-mark gutter. */
const QR_PAY_SHEET_HORIZONTAL_INSET = 50;

/**
 * Header, amount card, copy, gaps, crop-mark gutter, and padding — everything
 * that is not the plate. Overestimate so the sheet shrinks the JPEG rather
 * than clipping it.
 */
const QR_PAY_SHEET_CHROME_HEIGHT = 472;

/**
 * Pixel box that shows the whole plate (`contain`). Never fills a mismatched
 * box the way `cover` would — a portrait JPEG in a short well gets narrower,
 * not side-cropped.
 */
export function containFittedSize({
  maxWidth,
  maxHeight,
  aspectRatio,
}: {
  maxWidth: number;
  maxHeight: number;
  aspectRatio: number;
}): { width: number; height: number } {
  if (maxWidth <= 0 || maxHeight <= 0 || aspectRatio <= 0) {
    return { width: 0, height: 0 };
  }
  const heightIfFullWidth = maxWidth / aspectRatio;
  if (heightIfFullWidth <= maxHeight) {
    return { width: maxWidth, height: heightIfFullWidth };
  }
  return { width: maxHeight * aspectRatio, height: maxHeight };
}

/** Explicit width and height for the GCash plate inside the 90% sheet. */
export function paymentQrPlateSize(
  window: { width: number; height: number },
  insetBottom = 0,
): { width: number; height: number } {
  const maxWidth = Math.max(0, window.width - QR_PAY_SHEET_HORIZONTAL_INSET);
  const maxHeight = Math.max(
    0,
    window.height * QR_PAY_SHEET_MAX_HEIGHT_RATIO -
      QR_PAY_SHEET_CHROME_HEIGHT -
      Math.max(insetBottom, 12),
  );
  return containFittedSize({
    maxWidth,
    maxHeight,
    aspectRatio: GCASH_QR_ASPECT_RATIO,
  });
}

/** Settings field the API now serves; typed here so `lib/api.ts` stays untouched. */
export type PaymentQr = {
  method?: string;
  caption?: string;
  imageUrl?: string;
};

export function paymentQrFromSettings(settings: unknown): PaymentQr | null {
  if (!settings || typeof settings !== "object") return null;
  const value = (settings as { paymentQr?: unknown }).paymentQr;
  if (!value || typeof value !== "object") return null;
  const raw = value as { method?: unknown; caption?: unknown; imageUrl?: unknown };
  const qr: PaymentQr = {};
  if (typeof raw.method === "string") qr.method = raw.method;
  if (typeof raw.caption === "string") qr.caption = raw.caption;
  if (typeof raw.imageUrl === "string" && raw.imageUrl.trim()) qr.imageUrl = raw.imageUrl.trim();
  return qr;
}

/** Uploaded public URL when Operations set one, else the bundled JPEG. */
export function paymentQrImageSource(imageUrl?: string | null) {
  const resolved = notificationImageUrl(imageUrl);
  return resolved ? { uri: resolved } : images.gcashQr;
}

/**
 * GRIDGO's QR, big enough to scan off the screen.
 *
 * The checkout sheet could only ever say the words "QR Ph"; the code itself
 * lived nowhere, so a client reading "scan with GCash" had nothing to scan.
 * This is that code, at a size a second phone's camera can actually read,
 * with the amount over it so the two are checked together.
 *
 * The plate is the GCash InstaPay screenshot — portrait, not a square QR
 * tile. Percentage width plus aspect-ratio inside an overflow-hidden
 * crop-mark well laid the JPEG out at its native 1050px and clipped to the
 * left strip (blue fill, edge of the white card, no QR). Size it with
 * explicit pixels from the remaining sheet, `contain`, and crop marks that
 * do not clip, so the whole plate — InstaPay code and name — stays on screen.
 *
 * Nothing here takes money. Closing goes back to checkout, where the receipt
 * screenshot and the reference number are — those stay on the sheet behind
 * this one on purpose, because they are the part Operations matches by hand.
 */
export function QrPaySheet({ open, onClose, downpaymentMinor, imageUrl, paymentKind = "checkout" }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const plate = paymentQrPlateSize(
    {
      width: width > 0 ? width : 390,
      height: height > 0 ? height : 844,
    },
    insets.bottom,
  );

  // Closing forgets the last save attempt, in the same render it closes.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setSaving(false);
      setSaveNote(null);
    }
  }

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveNote(null);
    const result = await savePaymentQrToPhotos(imageUrl);
    setSaveNote(saveQrMessage(result));
    setSaving(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={paymentKind === "final" ? "Scan to pay the final balance" : paymentKind === "initial" ? "Scan to pay the initial amount" : "Scan to send 75%"}
      subtitle="GRIDGO takes QR Ph only."
      maxHeightRatio={QR_PAY_SHEET_MAX_HEIGHT_RATIO}
    >
      <View className="gap-5 px-4 pt-4">
        <View className="gg-panel-high gap-1">
          <Text className="text-caption text-text-muted">{paymentKind === "final" ? "Final payment due" : paymentKind === "initial" ? "Initial payment due" : "Send now (75%)"}</Text>
          <Text className="text-display text-text-primary">
            {downpaymentMinor == null ? "Not yet" : formatPhp(downpaymentMinor)}
          </Text>
          {downpaymentMinor == null ? (
            <Text className="text-caption text-text-muted">
              GRIDGO works the 75% out once every item has an address to be delivered to.
            </Text>
          ) : null}
        </View>

        <View className="items-center" style={{ overflow: "visible" }}>
          <CropMarkFrame clip={false}>
            <Image
              source={paymentQrImageSource(imageUrl)}
              accessibilityLabel="GRIDGO's QR Ph code"
              resizeMode="contain"
              style={{ width: plate.width, height: plate.height, overflow: "visible" }}
            />
          </CropMarkFrame>
        </View>

        <View className="gap-2">
          <Pressable
            onPress={() => void onSave()}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={SAVE_QR_A11Y}
            accessibilityState={{ disabled: saving }}
            className={saving ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
            style={({ pressed }) => (pressed && !saving ? { opacity: 0.85 } : undefined)}
          >
            <Text className="text-button text-text-primary">
              {saving ? "Saving…" : SAVE_QR_LABEL}
            </Text>
          </Pressable>
          {saveNote ? (
            <Text className="text-caption text-text-muted">{saveNote}</Text>
          ) : null}
          <Text className="text-body text-text-secondary">{PAYMENT_CHOICE_BLURB}</Text>
          <Text className="text-caption text-text-muted">
            Close this when you have sent it. The screenshot and the reference number go on
            the payment form behind — GRIDGO checks them against its wallet by hand.
          </Text>
        </View>
      </View>
    </Sheet>
  );
}
