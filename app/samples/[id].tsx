import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorScreenState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { BatchOrderPanel } from "@/components/sampleFirst/BatchOrderPanel";
import { SampleDecision } from "@/components/sampleFirst/SampleDecision";
import { SkeletonBlock } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import type { SampleBatch, SampleBatchPricing } from "@/lib/api";
import { readyByDate } from "@/lib/readyTime";
import {
  canCancelBatch,
  canResample,
  defaultBatchPricing,
  holdLine,
  sampleStage,
  sampleStatusView,
} from "@/lib/sampleFirst";
import { cartIsOpen, cartLineCount, useCart } from "@/store/cart";
import { useSampleBatches } from "@/store/sampleBatches";

/**
 * One sample and the batch it stands for (gridgo-api#222).
 *
 * Where the sample stands leads, with the held price's clock. Then the one
 * thing to do at this stage: wait for the sample, approve or reject it, order
 * the batch, or order a new sample after a rejection. Both orders are linked
 * from here, and the batch as it was saved closes the screen.
 */
export default function SampleBatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const batch = useSampleBatches((state) => (id ? state.byId[id] : undefined));
  const readError = useSampleBatches((state) => (id ? state.readError[id] : null));
  const busy = useSampleBatches((state) => state.busy);
  const actionError = useSampleBatches((state) => state.actionError);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [pricing, setPricing] = useState<SampleBatchPricing | null>(null);
  const [confirming, setConfirming] = useState<"basket" | "cancel" | null>(null);

  // A live refresh re-reads at the quantity on screen, or its price would never land.
  const shownQuantity = useRef<number | null>(null);
  const load = useCallback(
    () => (id ? useSampleBatches.getState().load(id, shownQuantity.current ?? undefined) : undefined),
    [id],
  );
  useLiveRefresh(["orders"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      useSampleBatches.getState().clearActionError();
      // Back from checkout or the order: start again from the saved batch.
      shownQuantity.current = null;
      setQuantity(null);
      void load();
    }, [load]),
  );

  // Another quantity is priced by GRIDGO, a beat after the last tap.
  useEffect(() => {
    shownQuantity.current = quantity;
    if (!id || quantity == null) return;
    const timer = setTimeout(() => void useSampleBatches.getState().load(id, quantity), 300);
    return () => clearTimeout(timer);
  }, [id, quantity]);

  if (!batch) {
    if (readError) {
      return (
        <Screen edges={["bottom"]}>
          <ErrorScreenState label="Sample not loaded" body={readError} onRetry={() => void load()} />
        </Screen>
      );
    }
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-3 pt-4" accessibilityLabel="Loading your sample">
          <SkeletonBlock className="h-24 w-full rounded-card" />
          <SkeletonBlock className="h-48 w-full rounded-card" />
        </View>
      </Screen>
    );
  }

  const stage = sampleStage(batch);
  const view = sampleStatusView(batch);
  const hold = holdLine(batch);
  const batchQuantity = quantity ?? batch.batch.quantity;
  const chosenPricing =
    (pricing === "held" && batch.canOrderAtHeldPrice) || (pricing === "current" && batch.canOrderAtCurrentPrice)
      ? pricing
      : defaultBatchPricing(batch);

  const openOrder = (orderId: string) => router.push(`/order/${orderId}` as Href);

  const orderNewSample = (replaces: boolean) =>
    router.push({
      pathname: "/request/listing",
      params: {
        itemId: batch.catalogItemId,
        sample: "1",
        quantity: String(batch.batch.quantity),
        ...(replaces ? { replaces: batch.id } : {}),
      },
    });

  // The phone keeps one basket. The batch opens as its own, so a basket
  // already holding other things is asked about before it is set aside.
  const orderBatch = async () => {
    setConfirming(null);
    if (!chosenPricing) return;
    const cart = await useSampleBatches.getState().orderBatch(batch.id, chosenPricing, batchQuantity);
    if (!cart) return;
    useCart.getState().adopt(cart);
    router.push("/checkout");
  };
  const onOrder = () => {
    if (cartIsOpen(useCart.getState())) setConfirming("basket");
    else void orderBatch();
  };

  return (
    <FormScreen
      contentContainerStyle={{ paddingBottom: 40 }}
      overlay={
        <>
          <ConfirmDialog
            visible={confirming === "basket"}
            question="Set your basket aside?"
            body={basketLine(cartLineCount(useCart.getState()))}
            confirmLabel={chosenPricing === "held" ? "Order at the held price" : "Order at today's price"}
            cancelLabel="Keep my basket"
            busy={busy != null}
            onConfirm={() => void orderBatch()}
            onCancel={() => setConfirming(null)}
          />
          <ConfirmDialog
            visible={confirming === "cancel"}
            question="Cancel this batch?"
            body="The batch saved with this sample will not be ordered, and its held price ends. The sample order itself is not affected."
            confirmLabel="Cancel the batch"
            cancelLabel="Keep it"
            tone="destructive"
            busy={busy === "cancel"}
            onConfirm={() => void useSampleBatches.getState().cancel(batch.id).then(() => setConfirming(null))}
            onCancel={() => setConfirming(null)}
          />
        </>
      }
    >
      <View className="gg-page gap-6 pt-2">
        <View className="gap-2">
          <Text className="text-overline text-text-muted">SAMPLE</Text>
          <Text className="text-h1 text-text-primary">{batch.itemName ?? "Your product"}</Text>
          <View className="flex-row">
            <StatusChip tone={view.tone} label={view.label} icon={view.icon} />
          </View>
          <Text className="text-body text-text-secondary">{view.line}</Text>
          {hold ? <Text className="text-caption text-text-muted">{hold}</Text> : null}
        </View>

        {stage === "decide" ? (
          <SampleDecision batch={batch} onOpenSampleOrder={() => openOrder(batch.sampleOrderId)} />
        ) : null}

        {stage === "approved" ? (
          <BatchOrderPanel
            batch={batch}
            quantity={batchQuantity}
            onQuantity={setQuantity}
            pricing={chosenPricing}
            onPricing={setPricing}
            onOrder={onOrder}
            onNewSample={() => orderNewSample(false)}
          />
        ) : null}

        {canResample(batch) ? (
          <PrimaryButton label="Order a new sample" onPress={() => orderNewSample(true)} />
        ) : null}

        {actionError ? (
          <Text className="text-body text-error" accessibilityLiveRegion="polite">
            {actionError}
          </Text>
        ) : null}

        <View className="gap-3">
          <SecondaryButton label="Open the sample order" onPress={() => openOrder(batch.sampleOrderId)} />
          {batch.batchOrderId ? (
            <SecondaryButton label="Open the batch order" onPress={() => openOrder(batch.batchOrderId!)} />
          ) : null}
        </View>

        <BatchRecord batch={batch} />

        {canCancelBatch(batch) ? (
          <Pressable
            onPress={() => setConfirming("cancel")}
            disabled={busy != null}
            accessibilityRole="button"
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Text className="text-button text-text-secondary">Cancel this batch</Text>
          </Pressable>
        ) : null}
      </View>
    </FormScreen>
  );
}

/** The batch as it was saved, and what the client decided about the sample. */
function BatchRecord({ batch }: { batch: SampleBatch }) {
  const note = typeof batch.batch.specialInstructions === "string" ? batch.batch.specialInstructions.trim() : "";
  const approvedAt = batch.approval ? readyByDate(batch.approval.at) : null;
  const rejectedAt = batch.rejection ? readyByDate(batch.rejection.at) : null;
  return (
    <View className="gap-1">
      <Text className="text-overline text-text-muted">YOUR BATCH</Text>
      <View className="gg-card-flush px-4">
        <SpecRow label="Product" value={batch.itemName ?? "—"} />
        <SpecRow label="Quantity" value={batch.batch.quantity.toLocaleString("en-PH")} />
        {note ? <SpecRow label="Notes" value={note} /> : null}
        {approvedAt ? (
          <SpecRow label="Approved" value={batch.approval?.samplePhotoFileId ? `${approvedAt}, with a photo` : approvedAt} />
        ) : null}
        {rejectedAt && batch.rejection ? <SpecRow label="Rejected" value={`${rejectedAt}: ${batch.rejection.reason}`} /> : null}
      </View>
    </View>
  );
}

function basketLine(count: number): string {
  const items = count === 1 ? "1 item" : `${count} items`;
  return `Your basket has ${items}. The batch opens as its own order, so the basket on this phone is replaced.`;
}
