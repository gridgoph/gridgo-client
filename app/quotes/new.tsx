import { Check, ChevronRight, MapPin, Package } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";

import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FormField, FormSection } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { useArtworkUpload } from "@/hooks/useArtworkUpload";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { isArtworkBusy } from "@/lib/artworkUpload";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import {
  QUOTE_LIMITS,
  QUOTE_PRODUCT_TYPES,
  checkQuoteBrief,
  isQuotedProduct,
  quoteErrorMessage,
  quoteHref,
} from "@/lib/quoteRequests";
import { deliveryChoice } from "@/lib/requestFulfilment";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { useQuoteBrief } from "@/store/quoteBrief";

/**
 * Request a quote for custom signage or 3D printing (gridgo-api#226).
 *
 * The file comes first, because it is what Operations shows the shops. Then
 * the few facts a shop needs to price the job, and where it is going. There is
 * no deadline: an event date may be given for information, and each option
 * then says whether it is ready before it.
 */
export default function NewQuoteScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { productType } = useLocalSearchParams<{ productType?: string }>();
  const draft = useQuoteBrief((state) => state.draft);
  const errors = useQuoteBrief((state) => state.errors);
  const busy = useQuoteBrief((state) => state.busy);
  const sendError = useQuoteBrief((state) => state.error);
  const setField = useQuoteBrief((state) => state.set);
  const artwork = useArtworkUpload();
  const choice = useJobFulfilment((state) => state.choice);
  const [defaultPlace, setDefaultPlace] = useState<api.ClientAddress | null>(null);

  // A fresh brief and a fresh delivery answer on every visit.
  useEffect(() => {
    useQuoteBrief.getState().start(isQuotedProduct(productType) ? (productType as string) : "");
    useJobFulfilment.getState().clear();
  }, [productType]);

  // The file the card holds is the brief's reference once GRIDGO stores it.
  const storedFileId = artwork.state.phase === "stored" ? artwork.state.fileId : null;
  useEffect(() => {
    setField("referenceFileId", storedFileId);
  }, [setField, storedFileId]);

  // Delivery starts on the client's default address, as the order flow does.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void api
        .listAddresses()
        .then((list) => {
          if (live) setDefaultPlace(list.find((address) => address.isDefault) ?? list[0] ?? null);
        })
        .catch(() => undefined);
      return () => {
        live = false;
      };
    }, []),
  );

  const fulfilment: api.RequestFulfilment | null =
    choice ??
    (defaultPlace
      ? deliveryChoice({
          lat: defaultPlace.point.lat,
          lng: defaultPlace.point.lng,
          label: defaultPlace.addressLine || defaultPlace.label,
        })
      : null);
  const chooseFulfilment = () => {
    router.push({ pathname: "/request/fulfilment", params: { purpose: "quote" } });
  };

  const send = async () => {
    const store = useQuoteBrief.getState();
    if (store.busy) return;
    store.setError(null);
    const { errors: found, brief } = checkQuoteBrief(store.draft);
    store.setErrors(fulfilment ? found : { ...found, fulfilment: "Choose delivery or pick-up." });
    if (!brief || !fulfilment) {
      store.setError("Check the fields marked above.");
      return;
    }
    store.setBusy(true);
    try {
      const request = await api.createQuoteRequest({
        ...brief,
        fulfillmentMode: fulfilment.fulfillmentMode,
        ...(fulfilment.fulfillmentMode === "delivery" && fulfilment.dropoff ? { dropoff: fulfilment.dropoff } : {}),
      });
      artwork.reset();
      useJobFulfilment.getState().clear();
      router.replace(quoteHref(request.id) as Href);
    } catch (error) {
      useQuoteBrief.getState().setError(quoteErrorMessage(error, "GRIDGO could not send your quote request. Try again."));
    } finally {
      useQuoteBrief.getState().setBusy(false);
    }
  };

  return (
    <FormScreen>
      <View className="gg-page gap-8 pb-16 pt-2">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">Request a quote</Text>
          <Text className="text-body-lg text-text-secondary">
            GRIDGO asks suitable shops and sends you up to three options to choose from.
          </Text>
        </View>

        <FormSection title="Artwork or reference">
          <FormField
            label="Your file"
            error={errors.referenceFileId}
            helper="A design, a sketch or a photo of something like it."
          >
            <ArtworkUploadCard
              state={artwork.state}
              onPick={() => void artwork.pick()}
              onRetry={() => void artwork.retry()}
              onCancel={artwork.cancel}
            />
          </FormField>
        </FormSection>

        <FormSection title="The job">
          <FormField label="Product type" error={errors.productType}>
            <View className="gap-3" accessibilityRole="radiogroup" accessibilityLabel="Product type">
              {QUOTE_PRODUCT_TYPES.map((type) => (
                <RadioCard
                  key={type.code}
                  title={type.name}
                  body={type.hint}
                  selected={draft.productType === type.code}
                  onPress={() => setField("productType", type.code)}
                />
              ))}
            </View>
          </FormField>

          <FormField label="What is it for?" error={errors.use}>
            <TextField
              value={draft.use}
              onChangeText={(value) => setField("use", value)}
              placeholder="Shop front sign, architecture model"
              accessibilityLabel="What is it for?"
              maxLength={QUOTE_LIMITS.use}
            />
          </FormField>

          <FormField label="Indoor or outdoor" error={errors.placement}>
            <View className="flex-row gap-3" accessibilityRole="radiogroup" accessibilityLabel="Indoor or outdoor">
              {(["indoor", "outdoor"] as const).map((placement) => (
                <View key={placement} className="flex-1">
                  <RadioCard
                    title={placement === "indoor" ? "Indoor" : "Outdoor"}
                    selected={draft.placement === placement}
                    onPress={() => setField("placement", placement)}
                  />
                </View>
              ))}
            </View>
          </FormField>

          <FormField label="Size" error={errors.size}>
            <TextField
              value={draft.size}
              onChangeText={(value) => setField("size", value)}
              placeholder="2 x 6 ft"
              accessibilityLabel="Size"
              maxLength={QUOTE_LIMITS.size}
            />
          </FormField>

          <FormField label="Quantity" error={errors.quantity}>
            <TextField
              value={draft.quantity}
              onChangeText={(value) => setField("quantity", value)}
              accessibilityLabel="Quantity"
              keyboardType="number-pad"
              maxLength={6}
            />
          </FormField>
        </FormSection>

        <FormSection title="Helpful, not needed">
          <FormField label="Notes" optional error={errors.notes}>
            <TextField
              value={draft.notes}
              onChangeText={(value) => setField("notes", value)}
              placeholder="Colours, finish, how it is mounted"
              accessibilityLabel="Notes"
              multiline
              maxLength={QUOTE_LIMITS.notes}
            />
          </FormField>

          <FormField
            label="Budget in pesos"
            optional
            error={errors.budget}
            helper="Helps GRIDGO ask the right shops."
          >
            <TextField
              value={draft.budget}
              onChangeText={(value) => setField("budget", value)}
              placeholder="5,000"
              accessibilityLabel="Budget in pesos"
              keyboardType="decimal-pad"
            />
          </FormField>

          <FormField
            label="Event date"
            optional
            error={errors.eventDate}
            helper="For information only. Each option says if it is ready before it."
          >
            <TextField
              value={draft.eventDate}
              onChangeText={(value) => setField("eventDate", value)}
              placeholder="YYYY-MM-DD"
              accessibilityLabel="Event date"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </FormField>
        </FormSection>

        <FormSection title="Delivery">
          <FormField
            label="How it reaches you"
            error={fulfilment ? null : errors.fulfilment}
          >
            <Pressable
              onPress={chooseFulfilment}
              accessibilityRole="button"
              accessibilityLabel={`${fulfilmentLine(fulfilment)}. Change`}
              className="gg-card-flush gg-touch flex-row items-center gap-3 p-4"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              {fulfilment?.fulfillmentMode === "pickup" ? (
                <Package size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              ) : (
                <MapPin size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              )}
              <Text className="min-w-0 flex-1 text-body text-text-primary" numberOfLines={2}>
                {fulfilmentLine(fulfilment)}
              </Text>
              <Text className="text-caption text-text-secondary">Change</Text>
              <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
            </Pressable>
          </FormField>
        </FormSection>

        <View className="gap-2">
          <PrimaryButton
            label={busy ? "Sending…" : "Send quote request"}
            onPress={() => void send()}
            disabled={busy || isArtworkBusy(artwork.state)}
          />
          {sendError ? (
            <Text className="text-center text-caption text-error" accessibilityLiveRegion="polite">
              {sendError}
            </Text>
          ) : (
            <Text className="text-center text-caption text-text-muted">
              No payment now. You choose an option first.
            </Text>
          )}
        </View>
      </View>
    </FormScreen>
  );
}

function fulfilmentLine(choice: api.RequestFulfilment | null): string {
  if (!choice) return "Choose delivery or pick-up";
  if (choice.fulfillmentMode === "pickup") return `Pick up at ${GRIDGO_OFFICE_LABEL}`;
  return `Deliver to ${choice.dropoff?.label || "your pin"}`;
}

/** One answer of a short choice. Monochrome when chosen; the screen's yellow is Send. */
function RadioCard({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={body ? `${title}. ${body}` : title}
      className={
        selected
          ? "gg-card-flush gg-touch flex-row items-center gap-3 border-2 border-accent p-4"
          : "gg-card-flush gg-touch flex-row items-center gap-3 border-2 border-transparent p-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body-lg font-bold text-text-primary">{title}</Text>
        {body ? <Text className="text-body text-text-secondary">{body}</Text> : null}
      </View>
      <View
        className={
          selected
            ? "h-6 w-6 items-center justify-center rounded-pill bg-accent"
            : "h-6 w-6 rounded-pill border-2 border-outline"
        }
        aria-hidden
      >
        {selected ? <Check size={14} color={colors.accentOn} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
