import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductPreview } from "@/components/ProductPreview";
import { RequestStepper } from "@/components/RequestStepper";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { formatPhp } from "@/lib/api";
import * as api from "@/lib/api";
import { formatUnitPrice } from "@/lib/catalog";
import { userFacingError, ZONE_OPTIONS, zoneLabel } from "@/lib/copy";
import { useThemeColors } from "@/hooks/useTheme";
import { REQUEST_STEPS, validateStep } from "@/lib/requestValidation";
import {
  draftFieldsFromStore,
  useRequestDraft,
} from "@/store/requestDraft";

/**
 * 4-step print request: Details → Artwork → Review → Confirm.
 * Draft is persisted (Zustand + AsyncStorage). Current step is yellow.
 */
export default function NewRequestScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const draft = useRequestDraft();
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stepId = REQUEST_STEPS[draft.stepIndex]?.id ?? "details";
  const fields = draftFieldsFromStore(draft);
  const estimated =
    draft.basePriceMinor > 0
      ? draft.basePriceMinor * Math.max(1, draft.quantity)
      : 0;
  const deliveryFee = 15000;

  const advance = () => {
    const result = validateStep(stepId, fields);
    if (!result.ok) {
      setBlockReason(result.reason);
      return;
    }
    setBlockReason(null);
    if (stepId === "confirm") {
      void sendRequest();
      return;
    }
    draft.goNext();
  };

  const sendRequest = async () => {
    const result = validateStep("confirm", fields);
    if (!result.ok) {
      setBlockReason(result.reason);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await api.createOrder({
        productId: draft.productId,
        title: draft.title || draft.productName,
        quantity: draft.quantity,
        size: draft.size.trim(),
        material: draft.material.trim(),
        deadline: draft.deadline.trim() || null,
        address: draft.address.trim(),
        zone: draft.zone || "davao_central",
        artworkName: draft.artworkName.trim(),
        deliveryFeeMinor: deliveryFee,
        submit: true,
      });
      draft.reset();
      router.replace(`/order/${order.id}`);
    } catch (e) {
      setSubmitError(
        userFacingError(
          e,
          "Could not send this request. Check your connection and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen" keyboardShouldPersistTaps="handled">
        <View className="gg-page gap-6 pb-12 pt-4">
          <View className="gap-1">
            <Text className="text-h2 text-text-primary">New request</Text>
            <Text className="text-body text-text-secondary">
              Your draft is kept if you leave this screen.
            </Text>
          </View>

          <RequestStepper currentIndex={draft.stepIndex} />

          {stepId === "details" ? (
            <View className="gap-4">
              <View className="gg-card gap-2">
                <Text className="text-caption text-text-muted">Product</Text>
                <Text className="text-body-lg font-medium text-text-primary">
                  {draft.productName || "Not selected"}
                </Text>
                {draft.basePriceMinor > 0 ? (
                  <Text className="text-body text-text-secondary">
                    From {formatUnitPrice(draft.basePriceMinor, draft.unit)}
                  </Text>
                ) : null}
                {!draft.productId ? (
                  <Text className="text-caption text-warning">
                    Choose a product from the catalog first.
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => router.push("/(tabs)/home")}
                  accessibilityRole="button"
                  className="gg-touch justify-center"
                >
                  <Text className="text-body font-medium text-brand">Browse catalog</Text>
                </Pressable>
              </View>

              <Field
                label="Job title"
                value={draft.title}
                onChangeText={(title) => draft.patch({ title })}
                placeholder="e.g. Grand opening tarpaulin"
              />
              <Field
                label="Size"
                value={draft.size}
                onChangeText={(size) => draft.patch({ size })}
                placeholder="e.g. 3x6 ft or A5"
              />
              <Field
                label="Material"
                value={draft.material}
                onChangeText={(material) => draft.patch({ material })}
                placeholder="e.g. 13oz tarpaulin"
              />
              <Field
                label="Quantity"
                value={String(draft.quantity)}
                onChangeText={(raw) => {
                  const n = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
                  draft.patch({ quantity: Number.isFinite(n) ? n : 0 });
                }}
                keyboardType="number-pad"
                placeholder="1"
              />
              <Field
                label="Deadline"
                value={draft.deadline}
                onChangeText={(deadline) => draft.patch({ deadline })}
                placeholder="e.g. 15 Aug 2026, 10:00"
                autoCapitalize="none"
              />
              <Field
                label="Delivery address"
                value={draft.address}
                onChangeText={(address) => draft.patch({ address })}
                placeholder="Street, barangay, Davao City"
                multiline
              />

              <View className="gap-2">
                <Text className="text-caption text-text-muted">Delivery area</Text>
                <View className="flex-row flex-wrap gap-2">
                  {ZONE_OPTIONS.map((zone) => {
                    const selected = draft.zone === zone.value;
                    return (
                      <Pressable
                        key={zone.value}
                        onPress={() => draft.patch({ zone: zone.value })}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className={
                          selected
                            ? "gg-chip gg-touch border-accent bg-accent px-4"
                            : "gg-chip gg-touch bg-surface px-4"
                        }
                      >
                        <Text
                          className={
                            selected
                              ? "text-button text-accent-on"
                              : "text-button text-text-secondary"
                          }
                        >
                          {zone.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : null}

          {stepId === "artwork" ? (
            <View className="gap-4">
              <ArtworkUploadCard
                artworkName={draft.artworkName}
                onChangeName={(artworkName) => draft.patch({ artworkName })}
              />
              <ProductPreview
                family={draft.family}
                artworkName={draft.artworkName}
                productName={draft.productName}
                size={draft.size}
              />
            </View>
          ) : null}

          {stepId === "review" || stepId === "confirm" ? (
            <View className="gap-4">
              <View className="gg-card">
                <Text className="mb-2 text-h3 text-text-primary">
                  {stepId === "confirm" ? "Ready to send" : "Review"}
                </Text>
                <SpecRow label="Product" value={draft.productName || "—"} />
                <SpecRow label="Title" value={draft.title || "—"} />
                <SpecRow label="Size" value={draft.size || "—"} />
                <SpecRow label="Material" value={draft.material || "—"} />
                <SpecRow label="Quantity" value={String(draft.quantity)} />
                <SpecRow label="Deadline" value={draft.deadline || "—"} />
                <SpecRow label="Address" value={draft.address || "—"} />
                <SpecRow label="Area" value={zoneLabel(draft.zone)} />
                <SpecRow label="Artwork" value={draft.artworkName || "—"} />
                <SpecRow
                  label="Est. print"
                  value={estimated > 0 ? formatPhp(estimated) : "From catalog"}
                />
                <SpecRow label="Delivery fee" value={formatPhp(deliveryFee)} />
              </View>
              <ProductPreview
                family={draft.family}
                artworkName={draft.artworkName}
                productName={draft.productName}
                size={draft.size}
              />
              {stepId === "confirm" ? (
                <Text className="text-body text-text-secondary">
                  Sending opens this job for QA. You can follow it under Orders.
                </Text>
              ) : null}
            </View>
          ) : null}

          {blockReason ? (
            <View className="gg-panel">
              <Text className="text-body text-error">{blockReason}</Text>
            </View>
          ) : null}
          {submitError ? (
            <View className="gg-panel">
              <Text className="text-body text-error">{submitError}</Text>
            </View>
          ) : null}

          <View className="gap-3">
            <PrimaryButton
              label={
                submitting
                  ? "Sending…"
                  : stepId === "confirm"
                    ? "Send request"
                    : "Continue"
              }
              disabled={submitting}
              onPress={advance}
            />
            {draft.stepIndex > 0 ? (
              <SecondaryButton
                label="Back"
                disabled={submitting}
                onPress={() => {
                  setBlockReason(null);
                  draft.goBack();
                }}
              />
            ) : null}
            {(draft.productId || draft.artworkName) && draft.stepIndex === 0 ? (
              <SecondaryButton
                label="Clear draft"
                disabled={submitting}
                onPress={() => {
                  draft.reset();
                  setBlockReason(null);
                }}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences";
}) {
  const colors = useThemeColors();
  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">{label}</Text>
      <TextInput
        className={multiline ? "gg-field min-h-20 py-3" : "gg-field"}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? "sentences"}
        accessibilityLabel={label}
      />
    </View>
  );
}
