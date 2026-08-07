import { Text, View } from "react-native";

import {
  MOCKUP_LABEL,
  templateForFamily,
  templateLabel,
  type PreviewTemplate,
} from "@/lib/productPreview";

type Props = {
  family?: string | null;
  artworkName?: string | null;
  productName?: string | null;
  size?: string | null;
};

/**
 * Visual product mockup: artwork name composited into a simple template.
 * Every render carries the exact label on the mockup itself.
 */
export function ProductPreview({ family, artworkName, productName, size }: Props) {
  const template = templateForFamily(family);
  const name = artworkName?.trim() || "No artwork yet";

  return (
    <View className="gg-card-flush">
      <View className="bg-surface-variant px-4 py-3">
        <Text className="text-caption text-text-muted">
          {templateLabel(template)} preview
          {productName ? ` · ${productName}` : ""}
          {size ? ` · ${size}` : ""}
        </Text>
      </View>
      <View className="items-center bg-surface p-4">
        <TemplateFrame template={template} artworkName={name} />
        {/* Required on the render itself, not only as a caption elsewhere. */}
        <View className="mt-3 w-full rounded-field bg-surface-high px-3 py-2">
          <Text className="text-center text-caption font-medium text-text-primary">
            {MOCKUP_LABEL}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TemplateFrame({
  template,
  artworkName,
}: {
  template: PreviewTemplate;
  artworkName: string;
}) {
  if (template === "tshirt") {
    return (
      <View className="h-48 w-40 items-center justify-center rounded-card border border-outline bg-canvas">
        <View className="h-6 w-28 rounded-t-field border border-b-0 border-outline bg-surface-variant" />
        <View className="h-36 w-32 items-center justify-center rounded-b-card border border-outline bg-surface px-2">
          <Text className="text-center text-caption text-text-primary" numberOfLines={3}>
            {artworkName}
          </Text>
        </View>
      </View>
    );
  }

  if (template === "tarpaulin") {
    return (
      <View className="h-36 w-full max-w-sm items-center justify-center rounded-sm border-2 border-outline bg-canvas px-3">
        <Text className="text-center text-body font-medium text-text-primary" numberOfLines={2}>
          {artworkName}
        </Text>
        <Text className="mt-2 text-caption text-text-muted">Banner / tarpaulin face</Text>
      </View>
    );
  }

  if (template === "signage") {
    return (
      <View className="h-40 w-44 items-center justify-center rounded-field border border-outline bg-canvas px-3">
        <View className="mb-2 h-2 w-16 rounded-pill bg-outline" />
        <Text className="text-center text-caption text-text-primary" numberOfLines={3}>
          {artworkName}
        </Text>
      </View>
    );
  }

  // flyer / generic
  return (
    <View className="h-48 w-36 items-center justify-center rounded-sm border border-outline bg-canvas px-3">
      <Text className="text-center text-caption text-text-primary" numberOfLines={4}>
        {artworkName}
      </Text>
      <Text className="mt-3 text-caption text-text-muted">Fold / face A</Text>
    </View>
  );
}
