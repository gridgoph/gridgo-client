import { SecondaryButton } from "@/components/SecondaryButton";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useArtworkImage } from "@/hooks/useArtworkImage";
import {
  MOCKUP_LABEL,
  templateForFamily,
  templateForSubcategory,
  templateLabel,
  type PreviewTemplate,
} from "@/lib/productPreview";

type Props = {
  family?: string | null;
  /**
   * A shop listing's platform subcategory. Wins over `family` when present,
   * because a listing has no catalog family to read a template from.
   */
  subcategoryCode?: string | null;
  artworkName?: string | null;
  productName?: string | null;
  size?: string | null;
  /** Stored artwork. When it is an image, it is composited into the template. */
  artworkFileId?: string | null;
};

/**
 * The artwork, seen as the product, before the client commits to printing it.
 *
 * Image artwork is fetched through the storage API and composited into the
 * template for its family. A PDF cannot be rasterised on the phone, so the
 * template names the file instead of pretending to show it. Every render
 * carries the mockup label on the render itself.
 */
export function ProductPreview({
  family,
  subcategoryCode,
  artworkName,
  productName,
  size,
  artworkFileId,
}: Props) {
  const template = subcategoryCode
    ? templateForSubcategory(subcategoryCode)
    : templateForFamily(family);
  const { uri, unavailable, document, markUnrenderable, retry, openFile, opening, openError } = useArtworkImage(artworkFileId);
  const name = artworkName?.trim() || "No artwork yet";

  const artwork: ReactNode = uri ? (
    <Image
      source={{ uri }}
      style={{ width: "100%", height: "100%" }}
      contentFit="contain"
      cachePolicy="none"
      transition={0}
      onError={markUnrenderable}
      accessibilityLabel={`Mockup of ${name}`}
    />
  ) : (
    <FileFace name={name} />
  );

  return (
    <View className="gg-card-flush">
      <View className="border-b border-outline-subtle bg-surface-variant px-4 py-3">
        <Text className="text-caption text-text-muted">
          {templateLabel(template)} preview
          {productName ? ` · ${productName}` : ""}
          {size ? ` · ${size}` : ""}
        </Text>
      </View>
      <View className="items-center gap-3 bg-surface px-4 py-5">
        <TemplateFrame template={template}>{artwork}</TemplateFrame>
        {/* Required on the render itself, not only as a caption elsewhere. */}
        <View className="w-full rounded-field bg-surface-high px-3 py-2">
          <Text className="text-center text-caption font-medium text-text-primary">
            {MOCKUP_LABEL}
          </Text>
        </View>
        {unavailable && artworkFileId ? (
          <Text className="text-center text-caption text-text-muted">
            The image preview could not load. Retry the preview or open the original file.
          </Text>
        ) : null}
        {document ? <Text className="text-center text-caption text-text-muted">This attachment is a document. Open the original to inspect it.</Text> : null}
        {unavailable ? <SecondaryButton label="Retry preview" onPress={retry} /> : null}
        {artworkFileId ? <SecondaryButton label={opening ? "Opening…" : "Open original file"} onPress={() => void openFile()} disabled={opening} /> : null}
        {openError ? <Text accessibilityRole="alert" className="text-body text-error">{openError}</Text> : null}
      </View>
    </View>
  );
}

/** Fallback face: the file's name, set inside the product's shape. */
function FileFace({ name }: { name: string }) {
  return (
    <View className="h-full w-full items-center justify-center bg-canvas px-3">
      <Text className="text-center text-caption text-text-primary" numberOfLines={4}>
        {name}
      </Text>
    </View>
  );
}

function TemplateFrame({
  template,
  children,
}: {
  template: PreviewTemplate;
  children: ReactNode;
}) {
  if (template === "tshirt") {
    return (
      <View className="h-52 w-44 items-center">
        <View className="h-7 w-32 rounded-t-field border border-b-0 border-outline bg-surface-variant" />
        <View className="w-40 flex-1 items-center justify-center rounded-b-card border border-outline bg-surface p-3">
          <View className="h-full w-full overflow-hidden rounded-sm border border-outline-subtle">
            {children}
          </View>
        </View>
      </View>
    );
  }

  if (template === "tarpaulin") {
    return (
      <View className="h-40 w-full max-w-sm overflow-hidden rounded-sm border-2 border-outline">
        {children}
      </View>
    );
  }

  if (template === "signage") {
    return (
      <View className="h-44 w-48 overflow-hidden rounded-field border border-outline">
        {children}
      </View>
    );
  }

  // flyer / generic — portrait sheet
  return (
    <View className="h-52 w-40 overflow-hidden rounded-sm border border-outline">
      {children}
    </View>
  );
}
