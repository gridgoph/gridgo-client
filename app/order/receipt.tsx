import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { CircleCheck, ChevronLeft } from "lucide-react-native";

import { ErrorState } from "@/components/ErrorState";
import { OrderReference } from "@/components/OrderReference";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PrintedReceipt } from "@/components/PrintedReceipt";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ServiceFeeRow } from "@/components/ServiceFeeRow";
import { SkeletonLine, SkeletonList } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { useThemeColors } from "@/hooks/useTheme";
import { FILE_CHECK_AFTER_PAYMENT } from "@/lib/checkout";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { physicalInvoiceEntry } from "@/lib/physicalInvoice";
import { canRate } from "@/lib/rating";
import {
  HOME_TAB,
  isCheckoutReceipt,
  ORDERS_TAB,
  placedReceiptFor,
  RECEIPT_BLURB,
  RECEIPT_HEADLINE,
  receiptFromInvoice,
  receiptFromOrder,
  receiptFulfilmentRow,
  type ReceiptView,
} from "@/lib/receipt";
import { formatTimelineStamp } from "@/lib/relativeTime";
import { serviceFeeVisibleToClient } from "@/lib/serviceFee";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * The acknowledgement that this order was placed.
 *
 * The invoice snapshot already exists on GRIDGO. This screen is the first
 * place a client can open it: GRIDGO printing, delivery, the total, and the
 * payment reference they sent. The snapshotted fee is already inside printing.
 */
export default function OrderReceiptScreen() {
  const { orderId, from } = useLocalSearchParams<{ orderId: string; from?: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const fromCheckout = isCheckoutReceipt(from);
  const settings = usePlatformSettings((state) => state.settings);

  // Checkout hands over the summary it was just given, so the slip can print
  // at once; the reads below refresh it.
  const [view, setView] = useState<ReceiptView | null>(() =>
    fromCheckout ? placedReceiptFor(orderId) : null,
  );
  const [order, setOrder] = useState<api.Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<typeof ORDERS_TAB | typeof HOME_TAB | null>(null);
  const loadSequence = useRef(0);

  const exitToOrders = useCallback(() => {
    setLeaving(ORDERS_TAB);
  }, []);

  // After place, history can still be the request. Intercept every back path
  // — header, gesture, Android arrow — so none of them reopen artwork. The
  // flag drops first so this guard cannot also catch the dismiss it starts.
  usePreventRemove(fromCheckout && !leaving, exitToOrders);

  useEffect(() => {
    if (!leaving) return;
    router.dismissTo(leaving);
  }, [leaving, router]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!orderId) return;
    try {
      const [invoiceResult, current] = await Promise.all([
        api.getInvoice(orderId).catch(() => null),
        api.getOrder(orderId),
      ]);
      if (sequence !== loadSequence.current) return;
      const next = invoiceResult
        ? receiptFromInvoice(invoiceResult, current)
        : receiptFromOrder(current);
      if (!next) {
        setView(null);
        setOrder(current);
        setError("GRIDGO has not issued a receipt for this order yet.");
        return;
      }
      setView(next);
      setOrder(current);
      setError(null);
    } catch (caught) {
      if (sequence !== loadSequence.current) return;
      setError(userFacingError(caught, "Could not load this receipt. Open the order and try again."));
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadSequence.current++;
      };
    }, [load]),
  );

  const physicalInvoice = physicalInvoiceEntry(order);

  const openOrder = () => {
    if (!orderId) return;
    router.push({ pathname: "/order/[id]", params: { id: orderId } });
  };

  const headerEscape = fromCheckout ? (
    <Stack.Screen
      options={{
        title: "Order placed",
        headerLeft: () => (
          <Pressable
            onPress={exitToOrders}
            accessibilityRole="button"
            accessibilityLabel="Back to orders"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Orders</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  if (error && !view) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-3 pt-6">
          <ErrorState label="Could not load receipt" body={error} onRetry={() => void load()} />
          {orderId ? <SecondaryButton label="View this order" onPress={openOrder} /> : null}
        </View>
      </Screen>
    );
  }

  if (fromCheckout) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <PrintedReceipt
          view={view}
          showServiceFee={serviceFeeVisibleToClient(settings)}
          thanks={<OrderPlacedThanks />}
          actions={
            <>
              <PrimaryButton label="View order" onPress={openOrder} />
              <SecondaryButton label="Back to Home" onPress={() => setLeaving(HOME_TAB)} />
            </>
          }
        />
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-4 pt-6">
          <SkeletonLine width="w-1/2" height="h-7" />
          <SkeletonLine width="w-3/4" height="h-5" />
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      {headerEscape}
      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-8 pb-16 pt-4">
        <View className="gap-3">
          <Text className="text-h1 text-text-primary">{RECEIPT_HEADLINE}</Text>
          <Text className="text-body text-text-secondary">{RECEIPT_BLURB}</Text>
          <OrderReference id={view.orderId} />
        </View>

        <View className="gg-card">
          {view.invoiceNumber ? (
            <SpecRow label="Invoice" value={view.invoiceNumber} />
          ) : null}
          {view.issuedAt ? (
            <SpecRow label="Issued" value={formatTimelineStamp(view.issuedAt)} />
          ) : null}
          {view.paymentReference ? (
            <SpecRow label="Payment reference" value={view.paymentReference} />
          ) : (
            <SpecRow label="Payment reference" value="Waiting on your QR receipt" />
          )}
        </View>

        {view.lines.length ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">WHAT WAS ORDERED</Text>
            <View className="gg-card">
              {view.lines.map((line) => (
                <SpecRow
                  key={line.id}
                  label={line.quantity > 1 ? `${line.name} · ${line.quantity}` : line.name}
                  value={line.amountLabel}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <Text className="text-overline text-text-muted">PAYMENT DETAILS</Text>
          <View className="gg-card">
            <SpecRow label="Printing" value={formatPhp(view.money.printingMinor)} />
            <SpecRow {...receiptFulfilmentRow(view.money)} />
            {serviceFeeVisibleToClient(settings) ? (
              <ServiceFeeRow explainOnly rateBps={view.money.serviceFeeRateBps} />
            ) : null}
            <View className="flex-row items-baseline justify-between gap-4 pt-3">
              <Text className="text-body-lg text-text-secondary">Total</Text>
              <Text className="text-h3 text-text-primary">{formatPhp(view.money.totalMinor)}</Text>
            </View>
          </View>
          {orderId && physicalInvoice ? (
            <SecondaryButton
              label={physicalInvoice.label}
              onPress={() =>
                router.push({
                  pathname: "/order/physical-invoice",
                  params: { orderId },
                })
              }
            />
          ) : null}
        </View>

        {order && canRate(order) ? (
          <View className="gg-card gap-3 p-4">
            <Text className="text-h3 text-text-primary">How did it go?</Text>
            <Text className="text-body text-text-secondary">
              Rate this job and GRIDGO sends your next one to a shop that did well by you.
            </Text>
            <PrimaryButton
              label="Rate this order"
              onPress={() =>
                router.push({ pathname: "/order/rate", params: { orderId: order.id } })
              }
            />
          </View>
        ) : (
          <PrimaryButton label="View this order" onPress={openOrder} />
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * The calm close to the print: the order is in, and what happens next.
 * Placed, not paid — the slip says where the payment stands.
 */
function OrderPlacedThanks() {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-11 w-11 items-center justify-center rounded-pill bg-surface-variant">
        <CircleCheck size={24} color={colors.success} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5" accessible accessibilityRole="header">
        <Text className="text-h3 text-text-primary">Thank you for ordering</Text>
        <Text className="text-body text-text-secondary">
          Your order is placed. GRIDGO checks your payment next.
        </Text>
        {/* The shop hears of the job only once the file passes (#122). */}
        <Text className="text-body text-text-secondary">{FILE_CHECK_AFTER_PAYMENT}</Text>
      </View>
    </View>
  );
}
