import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArtworkUploadCard } from "@/components/ArtworkUploadCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { DateTimeField } from "@/components/form/DateTimeField";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { FormField, FormSection } from "@/components/form/FormField";
import { OptionPicker, type PickerOption } from "@/components/form/OptionPicker";
import { QuantityStepper } from "@/components/form/QuantityStepper";
import { TextField } from "@/components/form/TextField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductPreview } from "@/components/ProductPreview";
import { RequestStepper } from "@/components/RequestStepper";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { useArtworkUpload } from "@/hooks/useArtworkUpload";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { composeAddress, DELIVERY_CITY } from "@/lib/address";
import { isArtworkBusy } from "@/lib/artworkUpload";
import { formatUnitPrice } from "@/lib/catalog";
import { userFacingError } from "@/lib/copy";
import {
  describeLeadTime,
  earliestDeadline,
  formatDeadline,
  latestDeadline,
  MIN_LEAD_HOURS,
  suggestedDeadline,
} from "@/lib/deadline";
import { describeQuantity } from "@/lib/quantity";
import { REQUEST_STEPS, validateStep } from "@/lib/requestValidation";
import { describeSize, sizeCatalogFor, type SizeCatalogEntry } from "@/lib/sizes";
import {
  resumeSubmitPhase,
  submitPhaseBody,
  submitPhaseLabel,
  type SubmitPhase,
} from "@/lib/submitRequest";
import {
  EMPTY_TAXONOMY,
  finishOptions,
  materialOptions,
  type Taxonomy,
} from "@/lib/taxonomy";
import { activeZones, resolveZoneCode, zoneName, type Zone } from "@/lib/zones";
import {
  draftFieldsFromStore,
  draftHasContent,
  useRequestDraft,
  type RequestDraftState,
} from "@/store/requestDraft";

/**
 * Four-step print request: Details → Artwork → Review → Send.
 *
 * Every value the platform already defines is chosen, never typed: materials
 * and finishes come from `GET /taxonomy`, the delivery area from `GET /zones`,
 * the deadline from a real date and time picker. The draft is persisted, so
 * this survives the app being killed mid-request.
 *
 * No price is stated here. Delivery is priced by the distance from a supplier
 * who has not been chosen yet, and the job's own price is a range until one
 * accepts, so the last step says that instead of showing a total it cannot
 * stand behind.
 *
 * The screen carries exactly one yellow control, and it is always the thing to
 * do next — pick a file on the artwork step, continue everywhere else.
 */
export default function NewRequestScreen() {
  const router = useRouter();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const reducedMotion = useReducedMotion();
  const draft = useRequestDraft();
  const artwork = useArtworkUpload({
    fileId: draft.artworkFileId,
    fileName: draft.artworkName,
  });

  const [taxonomy, setTaxonomy] = useState<Taxonomy>(EMPTY_TAXONOMY);
  const [zones, setZones] = useState<Zone[]>([]);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  /** Set once the order exists, so a retry never creates a second job. */
  const createdOrderId = useRef<string | null>(null);

  const stepId = REQUEST_STEPS[draft.stepIndex]?.id ?? "details";
  const fields = draftFieldsFromStore(draft);

  const loadReference = useCallback(async () => {
    try {
      const [taxonomyResult, zoneResult] = await Promise.all([api.getTaxonomy(), api.listZones()]);
      setTaxonomy(taxonomyResult);
      setZones(zoneResult);
      setReferenceError(null);
    } catch (e) {
      setReferenceError(
        userFacingError(
          e,
          "Could not load materials and delivery areas. Check your connection, then try again.",
        ),
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadReference();
    }, [loadReference]),
  );

  const patch = draft.patch;
  const adoptArtwork = artwork.adopt;
  const uploadedFileId = artwork.state.fileId;
  const uploadedFileName = artwork.state.fileName;
  const uploadPhase = artwork.state.phase;

  // Keep the persisted draft and the live upload in step, both ways.
  //
  // A finished upload writes its id into the draft, so the file survives the
  // app being killed. Coming back the other way matters just as much: the
  // persisted draft rehydrates from AsyncStorage a frame or two after first
  // render, so an already-uploaded file has to be adopted when it arrives, or
  // the card would claim no artwork was ever chosen.
  useEffect(() => {
    if (uploadedFileId && uploadedFileId !== draft.artworkFileId) {
      patch({ artworkFileId: uploadedFileId, artworkName: uploadedFileName });
      return;
    }
    if (!uploadedFileId && uploadPhase === "empty" && draft.artworkFileId) {
      adoptArtwork(draft.artworkFileId, draft.artworkName);
    }
  }, [
    uploadedFileId,
    uploadedFileName,
    uploadPhase,
    draft.artworkFileId,
    draft.artworkName,
    patch,
    adoptArtwork,
  ]);

  const materials = useMemo(
    () => materialOptions(taxonomy, draft.family),
    [taxonomy, draft.family],
  );
  const finishes = useMemo(() => finishOptions(taxonomy, draft.family), [taxonomy, draft.family]);
  const sizeCatalog = useMemo(() => sizeCatalogFor(draft.family), [draft.family]);
  const sizeOptions: PickerOption[] = sizeCatalog.options;
  const zoneOptions: PickerOption[] = useMemo(
    () =>
      activeZones(zones).map((zone) => ({
        value: zone.code,
        label: zone.name,
      })),
    [zones],
  );

  // A zone the client picked before the list loaded is honoured; otherwise the
  // first real area is chosen so the address is never left unplaced.
  useEffect(() => {
    if (!zones.length) return;
    const resolved = resolveZoneCode(zones, draft.zone);
    if (resolved !== draft.zone) patch({ zone: resolved });
  }, [zones, draft.zone, patch]);

  const artworkBusy = isArtworkBusy(artwork.state);
  const needsFile = !draft.artworkFileId;

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
    setSubmitError(null);
    // Three calls, named one at a time. A retry resumes where it stopped, so
    // the phase is derived from what already succeeded, never restarted at
    // "creating" when the job exists.
    setSubmitPhase(
      resumeSubmitPhase(Boolean(createdOrderId.current), artwork.state.phase === "attached"),
    );
    try {
      // The job is created as a draft, the artwork is bound to it, and only
      // then is it sent for QA — so Operations never opens a job with no file.
      let orderId = createdOrderId.current;
      if (!orderId) {
        const order = await api.createOrder({
          productId: draft.productId,
          title: draft.title.trim() || draft.productName,
          quantity: draft.quantity,
          size: draft.size.trim(),
          material: draft.material.trim(),
          finish: draft.finish.trim() || undefined,
          deadline: draft.deadline || null,
          address: composeAddress({
            line1: draft.addressLine1,
            barangay: draft.barangay,
            landmark: draft.landmark,
          }),
          zone: draft.zone,
          artworkName: draft.artworkName.trim() || null,
        });
        orderId = order.id;
        createdOrderId.current = order.id;
      }

      // A retry that got past the attach must not bind the same file twice.
      if (artwork.state.phase !== "attached") {
        setSubmitPhase("attaching");
        await artwork.attachTo(orderId);
      }
      setSubmitPhase("sending");
      await api.transitionOrder(orderId, "submitted", {
        note: "Sent for artwork QA",
      });

      createdOrderId.current = null;
      draft.reset();
      artwork.reset();

      // Open the job with the tab shell still underneath it.
      //
      // `replace` here targeted the root stack, whose only entry is `(tabs)`,
      // so it swapped the whole tab shell for the order screen: no tab bar, no
      // header back control, nothing but OS gestures to escape with. Switching
      // to Orders and pushing keeps `(tabs)` under the order, and puts the
      // client back among their jobs — not on an emptied stepper — when they
      // come back out.
      router.navigate("/(tabs)/orders");
      router.push(`/order/${orderId}`);
    } catch (e) {
      setSubmitError(
        createdOrderId.current
          ? userFacingError(
              e,
              "Your job was created but the artwork did not attach. Tap Send again — it will finish the same job, not start a new one.",
            )
          : userFacingError(e, "Could not send this request. Check your connection and try again."),
      );
    } finally {
      setSubmitPhase(null);
    }
  };

  const submitting = submitPhase !== null;

  const primaryLabel = submitting
    ? "Sending…"
    : stepId === "confirm"
      ? "Send request"
      : stepId === "artwork" && needsFile
        ? "Choose artwork file"
        : "Continue";

  const onPrimaryPress = () => {
    if (stepId === "artwork" && needsFile) {
      void artwork.pick();
      return;
    }
    advance();
  };

  return (
    /*
      A tab screen, so it owns its top edge — there is no header above it.
      The four free-text fields on the Details step (job title, street,
      barangay, landmark) are why this goes through `FormScreen`: the address
      sits at the bottom of a long scroll under a tab bar that floats over the
      scene, and nothing here avoided the keyboard at all before.
    */
    <FormScreen
      edges={["top"]}
      overlay={
        <>
          {/*
            Sending keeps this screen mounted, so the wait belongs on top of it
            rather than on a new screen. The scrim also stops a second tap from
            starting the same job twice while the first send is in flight.
          */}
          <LoadingOverlay
            visible={submitPhase !== null}
            label={submitPhase ? submitPhaseLabel(submitPhase) : ""}
            body={submitPhase ? submitPhaseBody(submitPhase) : undefined}
          />

          <ConfirmDialog
            visible={confirmClear}
            question={`Discard the draft for "${draft.title || draft.productName || "this request"}"?`}
            body="The specification you have entered and the artwork attached to this draft are removed from your phone. Jobs you have already sent are not affected."
            confirmLabel="Discard draft"
            tone="destructive"
            onConfirm={() => {
              draft.reset();
              artwork.reset();
              createdOrderId.current = null;
              setBlockReason(null);
              setSubmitError(null);
              setConfirmClear(false);
            }}
            onCancel={() => setConfirmClear(false)}
          />
        </>
      }
    >
      <View className="gg-page gap-8 pt-4" style={{ paddingBottom: tabPad }}>
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">
            {draft.productName || "New request"}
          </Text>
          <Text className="text-body text-text-secondary">
            Saved as you go. You can close the app and pick this up later.
          </Text>
        </View>

        <RequestStepper currentIndex={draft.stepIndex} />

        {/*
          The one orchestrated moment in this flow: a step landing. Animated
          components take a style, not a class, so the layout stays on the
          plain View inside.
        */}
        <Animated.View key={stepId} entering={reducedMotion ? undefined : FadeIn.duration(200)}>
          <View className="gap-8">
            {stepId === "details" ? (
              <DetailsStep
                draft={draft}
                materials={materials}
                finishes={finishes}
                sizeOptions={sizeOptions}
                sizeCatalog={sizeCatalog}
                zoneOptions={zoneOptions}
                referenceError={referenceError}
                onRetryReference={() => void loadReference()}
                onBrowseCatalog={() => router.push("/request/category")}
              />
            ) : null}

            {stepId === "artwork" ? (
              <View className="gap-6">
                <ArtworkUploadCard
                  state={artwork.state}
                  onPick={() => void artwork.pick()}
                  onRetry={() => void artwork.retry()}
                  onCancel={artwork.cancel}
                />
                {draft.artworkFileId ? (
                  <ProductPreview
                    family={draft.family}
                    artworkName={draft.artworkName}
                    productName={draft.productName}
                    size={describeSize(draft.family, draft.size)}
                    artworkFileId={draft.artworkFileId}
                  />
                ) : null}
              </View>
            ) : null}

            {stepId === "review" ? (
              <ReviewStep
                draft={draft}
                zones={zones}
                onEdit={() => draft.setStepIndex(0)}
                onEditArtwork={() => draft.setStepIndex(1)}
              />
            ) : null}

            {stepId === "confirm" ? (
              <SendStep
                unitPriceMinor={draft.basePriceMinor}
                unit={draft.unit}
                quantity={draft.quantity}
                deadline={draft.deadline}
              />
            ) : null}
          </View>
        </Animated.View>

        {blockReason ? (
          <View className="gg-panel gap-2">
            <StatusChip tone="warning" label="Not ready to continue" icon="triangle-alert" />
            <Text className="text-body text-text-primary">{blockReason}</Text>
          </View>
        ) : null}

        {submitError ? <ErrorState label="Not sent" body={submitError} /> : null}

        <View className="gap-3">
          <PrimaryButton
            label={primaryLabel}
            disabled={submitting || artworkBusy}
            onPress={onPrimaryPress}
          />
          {draft.stepIndex > 0 ? (
            <SecondaryButton
              label="Back"
              disabled={submitting || artworkBusy}
              onPress={() => {
                setBlockReason(null);
                setSubmitError(null);
                draft.goBack();
              }}
            />
          ) : null}
          {draft.stepIndex === 0 && draftHasContent(draft) ? (
            <SecondaryButton
              label="Discard this draft"
              disabled={submitting || artworkBusy}
              onPress={() => setConfirmClear(true)}
            />
          ) : null}
        </View>
      </View>
    </FormScreen>
  );
}

function DetailsStep({
  draft,
  materials,
  finishes,
  sizeOptions,
  sizeCatalog,
  zoneOptions,
  referenceError,
  onRetryReference,
  onBrowseCatalog,
}: {
  draft: RequestDraftState;
  materials: PickerOption[];
  finishes: PickerOption[];
  sizeOptions: PickerOption[];
  sizeCatalog: SizeCatalogEntry;
  zoneOptions: PickerOption[];
  referenceError: string | null;
  onRetryReference: () => void;
  onBrowseCatalog: () => void;
}) {
  const colors = useThemeColors();
  const now = Date.now();
  const leadTime = describeLeadTime(draft.deadline, now);

  return (
    <View className="gap-8">
      <FormSection title="Product">
        {/*
          Changing the product is a routine secondary control, so it stays
          monochrome. In Dark the `brand` gold this used to be is the action
          yellow exactly, which put a second CTA-coloured control on a screen
          that already spends its budget on the current stepper step and the
          one primary button.
        */}
        <View className="gg-card-flush">
          <View className="gap-2 p-4">
            {draft.productId ? (
              <>
                <Text className="text-h3 text-text-primary">{draft.productName}</Text>
                {draft.basePriceMinor > 0 ? (
                  <Text className="text-body text-text-secondary">
                    From {formatUnitPrice(draft.basePriceMinor, draft.unit)}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text className="text-h3 text-text-primary">Nothing chosen yet</Text>
                <Text className="text-body text-text-secondary">
                  What you are printing decides which sizes and materials you can pick, so
                  start there.
                </Text>
              </>
            )}
          </View>
          <Pressable
            onPress={onBrowseCatalog}
            accessibilityRole="button"
            className="gg-touch flex-row items-center justify-between gap-3 border-t border-outline-subtle px-4 py-3"
          >
            {({ pressed }) => (
              <>
                <Text className="text-button text-text-secondary">
                  {draft.productId ? "Change what you are printing" : "See what GRIDGO prints"}
                </Text>
                <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} />
                {pressed ? (
                  <View pointerEvents="none" className="gg-pressed absolute inset-0" />
                ) : null}
              </>
            )}
          </Pressable>
        </View>
      </FormSection>

      {referenceError ? (
        <ErrorState label="Options unavailable" body={referenceError} onRetry={onRetryReference} />
      ) : null}

      <FormSection title="Specification">
        <FormField label="Job title" helper="How this job appears in your order list.">
          <TextField
            value={draft.title}
            onChangeText={(title) => draft.patch({ title })}
            placeholder="Grand opening tarpaulin"
            accessibilityLabel="Job title"
            maxLength={80}
          />
        </FormField>

        <FormField label="Size">
          <OptionPicker
            title="Choose a size"
            accessibilityLabel="Size"
            value={draft.size}
            options={sizeOptions}
            onChange={(size) => draft.patch({ size })}
            placeholder="Choose a size"
            emptyReason="Choose a product first — sizes depend on what is being printed."
            custom={
              sizeCatalog.allowCustom
                ? {
                    label: "Enter a custom size",
                    hint: sizeCatalog.customHint,
                    placeholder: "e.g. 4 x 12 ft",
                  }
                : undefined
            }
          />
        </FormField>

        <FormField
          label="Material"
          helper="Suppliers quote against this exact material, so it is chosen, not typed."
        >
          <OptionPicker
            title="Choose a material"
            accessibilityLabel="Material"
            value={draft.material}
            options={materials}
            onChange={(material) => draft.patch({ material })}
            placeholder="Choose a material"
            emptyReason="Choose a product first — materials depend on what is being printed."
          />
        </FormField>

        {finishes.length ? (
          <FormField label="Finish" optional helper="Leave this out if you have no preference.">
            <OptionPicker
              title="Choose a finish"
              accessibilityLabel="Finish"
              value={draft.finish}
              options={finishes}
              onChange={(finish) => draft.patch({ finish })}
              placeholder="No preference"
            />
          </FormField>
        ) : null}

        <FormField label="Quantity">
          <QuantityStepper
            value={draft.quantity}
            unit={draft.unit}
            onChange={(quantity) => draft.patch({ quantity })}
          />
        </FormField>
      </FormSection>

      <FormSection title="Deadline">
        <FormField
          label="In your hands by"
          helper={
            leadTime
              ? `${leadTime} · printing and delivery need at least ${MIN_LEAD_HOURS} hours.`
              : `Printing and delivery need at least ${MIN_LEAD_HOURS} hours.`
          }
        >
          <DateTimeField
            value={draft.deadline}
            onChange={(deadline) => draft.patch({ deadline })}
            suggested={suggestedDeadline(now)}
            minimumDate={earliestDeadline(now)}
            maximumDate={latestDeadline(now)}
            placeholder="Pick a date and time"
            accessibilityLabel="Deadline"
          />
        </FormField>
      </FormSection>

      <FormSection title="Delivery">
        <FormField label="Street and number">
          <TextField
            value={draft.addressLine1}
            onChangeText={(addressLine1) => draft.patch({ addressLine1 })}
            placeholder="12 J.P. Laurel Ave"
            accessibilityLabel="Street and number"
            maxLength={120}
          />
        </FormField>

        <FormField label="Barangay" helper="Davao street names repeat across barangays.">
          <TextField
            value={draft.barangay}
            onChangeText={(barangay) => draft.patch({ barangay })}
            placeholder="Bajada"
            accessibilityLabel="Barangay"
            maxLength={80}
          />
        </FormField>

        <FormField
          label="Landmark"
          optional
          helper={`Everything is delivered inside ${DELIVERY_CITY}.`}
        >
          <TextField
            value={draft.landmark}
            onChangeText={(landmark) => draft.patch({ landmark })}
            placeholder="Beside the blue gate, 2nd floor"
            accessibilityLabel="Landmark"
            maxLength={120}
          />
        </FormField>

        <FormField
          label="Delivery area"
          helper="Places your address on the map. Delivery is priced by how far your supplier is from it."
        >
          <OptionPicker
            title="Choose a delivery area"
            accessibilityLabel="Delivery area"
            value={draft.zone}
            options={zoneOptions}
            onChange={(zone) => draft.patch({ zone })}
            placeholder="Choose a delivery area"
            emptyReason="Delivery areas have not loaded yet. Check your connection and try again."
          />
        </FormField>
      </FormSection>
    </View>
  );
}

function ReviewStep({
  draft,
  zones,
  onEdit,
  onEditArtwork,
}: {
  draft: RequestDraftState;
  zones: Zone[];
  onEdit: () => void;
  onEditArtwork: () => void;
}) {
  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="text-h2 text-text-primary">{draft.title || draft.productName}</Text>
        <Text className="text-body text-text-secondary">
          {describeQuantity(draft.quantity, draft.unit)} ·{" "}
          {describeSize(draft.family, draft.size)}
        </Text>
      </View>

      <ProductPreview
        family={draft.family}
        artworkName={draft.artworkName}
        productName={draft.productName}
        size={describeSize(draft.family, draft.size)}
        artworkFileId={draft.artworkFileId}
      />

      <View className="gg-card">
        <SpecRow label="Product" value={draft.productName || "—"} />
        <SpecRow label="Size" value={describeSize(draft.family, draft.size)} />
        <SpecRow label="Material" value={draft.material || "—"} />
        {draft.finish ? <SpecRow label="Finish" value={draft.finish} /> : null}
        <SpecRow label="Quantity" value={describeQuantity(draft.quantity, draft.unit)} />
        <SpecRow label="Deadline" value={formatDeadline(draft.deadline)} />
        <SpecRow
          label="Deliver to"
          value={composeAddress({
            line1: draft.addressLine1,
            barangay: draft.barangay,
            landmark: draft.landmark,
          })}
        />
        <SpecRow label="Area" value={zoneName(zones, draft.zone)} />
        <SpecRow label="Artwork" value={draft.artworkName || "—"} />
      </View>

      <View className="gap-3">
        <SecondaryButton label="Change the specification" onPress={onEdit} />
        <SecondaryButton label="Change the artwork" onPress={onEditArtwork} />
      </View>
    </View>
  );
}

/**
 * The last step before sending, and the one place a price could be invented.
 *
 * It is not. No exact price exists until a supplier accepts, and no delivery
 * fee exists until GRIDGO knows which shop the job is coming from — so this
 * screen quotes the catalog rate it genuinely knows and says, plainly, that a
 * price range lands on the job the moment it is sent.
 */
function SendStep({
  unitPriceMinor,
  unit,
  quantity,
  deadline,
}: {
  unitPriceMinor: number;
  unit: string;
  quantity: number;
  deadline: string;
}) {
  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="text-h2 text-text-primary">Ready to send</Text>
        <Text className="text-body text-text-secondary">
          Nothing is charged now, and nothing is owed until a supplier accepts the job.
        </Text>
      </View>

      <View className="gg-card">
        <SpecRow
          label="Catalog rate"
          value={unitPriceMinor > 0 ? formatUnitPrice(unitPriceMinor, unit) : "Priced on request"}
        />
        <SpecRow label="Quantity" value={describeQuantity(quantity, unit)} />
        <View className="gap-1 pt-3">
          <View className="flex-row items-baseline justify-between gap-4">
            <Text className="text-body-lg text-text-secondary">Price</Text>
            <Text className="text-body-lg text-text-primary">A range, once you send</Text>
          </View>
          <Text className="text-caption text-text-muted">
            GRIDGO shows the range this job costs to print as soon as it is sent. The exact
            figure exists only once GRIDGO has put it on a press, and delivery is priced by
            the distance from there to you.
          </Text>
        </View>
      </View>

      <View className="gg-panel gap-3">
        <Text className="text-body-lg font-medium text-text-primary">What happens next</Text>
        <Text className="text-body text-text-secondary">
          Operations checks your artwork against the print specification. If anything will
          not print cleanly they send it back with the reason, and you replace the file on
          this same job. Once it passes, GRIDGO matches it to a supplier.
        </Text>
        <Text className="text-caption text-text-muted">
          You are told the final price the moment a supplier accepts, and pay 75% by QR then
          the last 25% before delivery. The deadline you set — {formatDeadline(deadline)} — is
          what they commit to.
        </Text>
      </View>
    </View>
  );
}
