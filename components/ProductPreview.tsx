import { Image } from "expo-image";
import { CircleAlert, FileText, ImageOff, Info } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useArtworkImage } from "@/hooks/useArtworkImage";
import { useThemeColors } from "@/hooks/useTheme";
import { previewPageLine } from "@/lib/artworkPreview";
import { isWordDocument } from "@/lib/artworkUpload";
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
  /** Stored artwork. Its picture (an image, or page 1 of a PDF) is composited into the template. */
  artworkFileId?: string | null;
};

/**
 * The artwork, seen as the product, before the client commits to printing it.
 *
 * An image is composited into the template for its family, and so is page 1
 * of a PDF, from the picture GRIDGO renders of it (gridgo-api#232). A Word
 * file has no picture yet: the template names the file and GRIDGO's own words
 * say so. A preview that does not load keeps the product's shape, marks it as
 * failed, and says why with a Retry — it never leaves an empty frame that
 * reads as "still loading". Every render carries the mockup label.
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
  const { view, file, contentType, markUnrenderable, retry, retryBlocked, openFile, opening, openError } = useArtworkImage(artworkFileId);
  const name = artworkName?.trim() || file?.originalFilename || "No artwork yet";

  let artwork: ReactNode;
  if (!artworkFileId) artwork = <FileFace name={name} />;
  else if (view.kind === "loading") {
    artwork = (
      <View className="h-full w-full" accessible accessibilityLabel="Loading the preview">
        <SkeletonBlock className="h-full w-full" />
      </View>
    );
  } else if (view.kind === "image") {
    artwork = (
      <Image
        source={{ uri: view.uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        cachePolicy="none"
        transition={0}
        onError={markUnrenderable}
        accessibilityLabel={view.page ? `Mockup of ${name}, page 1` : `Mockup of ${name}`}
      />
    );
  } else if (view.kind === "failed") artwork = <FailedFace name={name} />;
  else artwork = <FileFace name={name} word={view.kind === "word" || isWordDocument(contentType)} />;

  const pageLine = view.kind === "image" && view.page ? previewPageLine(file) : null;

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
        {pageLine ? <Text className="text-center text-caption text-text-muted">{pageLine}</Text> : null}
        {artworkFileId && view.kind === "failed" ? (
          <PreviewProblem message={view.failure.message} onRetry={retry} retryBlocked={retryBlocked} />
        ) : null}
        {artworkFileId && view.kind === "word" ? <WordNotice message={view.message} /> : null}
        {view.kind === "document" ? <Text className="text-center text-caption text-text-muted">This attachment is a document. Open the original to inspect it.</Text> : null}
        {artworkFileId ? (
          <View className="w-full">
            <SecondaryButton label={opening ? "Opening…" : "Open original file"} onPress={() => void openFile()} disabled={opening} />
          </View>
        ) : null}
        {openError ? <Text accessibilityRole="alert" className="text-body text-error">{openError}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The failure, said where it can be acted on: what happened, why, and Retry.
 * Icon, title and the error outline carry it together, so it survives greyscale.
 */
function PreviewProblem({ message, onRetry, retryBlocked }: { message: string; onRetry: () => void; retryBlocked: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="w-full gap-3 rounded-card border border-error bg-surface p-3">
      <View accessible accessibilityRole="alert" className="flex-row items-start gap-3">
        <CircleAlert size={18} color={colors.error} strokeWidth={2} aria-hidden />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary">Preview did not load</Text>
          <Text className="text-body text-text-secondary">{message}</Text>
        </View>
      </View>
      <SecondaryButton label={retryBlocked ? "Retry preview (wait a moment)" : "Retry preview"} onPress={onRetry} disabled={retryBlocked} />
    </View>
  );
}

/** A Word file is not a failure: it has no picture yet, and GRIDGO says so. */
function WordNotice({ message }: { message: string }) {
  const colors = useThemeColors();
  return (
    <View accessible className="w-full flex-row items-start gap-3 rounded-card border border-info bg-surface p-3">
      <Info size={18} color={colors.info} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{message}</Text>
        <Text className="text-body text-text-secondary">Your file is uploaded. Open it to check the layout before you go on.</Text>
      </View>
    </View>
  );
}

/**
 * The product's shape with its picture missing: a dashed error edge and a
 * broken-picture mark, so the frame reads as failed rather than still loading.
 */
function FailedFace({ name }: { name: string }) {
  const colors = useThemeColors();
  return (
    <View className="h-full w-full items-center justify-center gap-2 border border-dashed border-error bg-canvas px-3">
      <ImageOff size={28} color={colors.error} strokeWidth={1.75} aria-hidden />
      <Text className="text-center text-caption text-text-primary" numberOfLines={3}>
        {name}
      </Text>
    </View>
  );
}

/**
 * Fallback face: the file's name, set inside the product's shape. A Word file
 * also carries a document mark, so it reads as a document rather than a blank
 * sheet; it is never laid out here.
 */
function FileFace({ name, word = false }: { name: string; word?: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="h-full w-full items-center justify-center gap-2 bg-canvas px-3">
      {word ? (
        <>
          <FileText size={32} color={colors.textSecondary} strokeWidth={1.75} aria-hidden />
          <Text className="text-caption text-text-muted">Word document</Text>
        </>
      ) : null}
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
