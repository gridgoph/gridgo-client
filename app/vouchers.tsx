import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { SkeletonBlock } from "@/components/Skeleton";
import { VoucherCodeField } from "@/components/VoucherCodeField";
import { TicketAction, VoucherTicket } from "@/components/VoucherTicket";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useServerNow, useWalletOnResume } from "@/hooks/useVoucherClock";
import {
  VOUCHER_TERMS,
  WALLET_TAB_LABEL,
  WALLET_TABS,
  voucherState,
  voucherTitle,
  walletTab,
  type WalletTab,
} from "@/lib/vouchers";
import { useCart } from "@/store/cart";
import { useVouchers } from "@/store/vouchers";

/**
 * Account → Vouchers: the wallet (gridgo-api#204).
 *
 * Code entry first, because the person most likely to open this screen with
 * nothing in it is a tester holding a code. Then the vouchers, by where they
 * stand — Available, Used, Expired — soonest to expire first, each a ticket
 * with its exact expiry and a live countdown. "Use now" does not spend
 * anything: it opens the order the voucher will come off, where GRIDGO
 * applies it.
 */
export default function VouchersScreen() {
  const router = useRouter();
  const list = useVouchers((state) => state.list);
  const loading = useVouchers((state) => state.loading);
  const error = useVouchers((state) => state.error);
  const load = useVouchers((state) => state.load);
  const addCode = useVouchers((state) => state.addCode);
  const cartId = useCart((state) => state.cartId);
  const [tab, setTab] = useState<WalletTab>("available");
  const now = useServerNow(30_000);

  const read = useCallback(() => void load(), [load]);
  useFocusEffect(read);
  useWalletOnResume(read);
  useLiveRefresh(["notifications"], load, { refreshOnFocus: false });

  const vouchers = list ? walletTab(list.vouchers, tab, now) : [];
  const counts = Object.fromEntries(
    WALLET_TABS.map((name) => [name, list ? walletTab(list.vouchers, name, now).length : 0]),
  ) as Record<WalletTab, number>;

  // A basket already started is where it comes off; otherwise start one.
  const openOrder = () => router.push(cartId ? "/checkout" : "/request/category");

  return (
    <FormScreen>
      <View className="gg-page gap-6 pb-10 pt-4">
        <View className="gg-card gap-3">
          <VoucherCodeField
            label="Have a voucher code?"
            onSubmit={async (code) => {
              const outcome = await addCode(code);
              if (outcome.ok) setTab(outcome.usable ? "available" : outcome.voucher.status === "used" ? "used" : "expired");
              return outcome.ok;
            }}
          />
        </View>

        <View className="gap-4">
          <View className="flex-row gap-2" accessibilityRole="tablist">
            {WALLET_TABS.map((name) => {
              const selected = name === tab;
              return (
                <Pressable
                  key={name}
                  onPress={() => setTab(name)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${WALLET_TAB_LABEL[name]}, ${counts[name]}`}
                  className={
                    selected
                      ? "gg-chip gg-touch min-w-0 flex-1 justify-center border-accent bg-accent px-2"
                      : "gg-chip gg-touch min-w-0 flex-1 justify-center bg-surface px-2"
                  }
                  style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
                >
                  <Text className={selected ? "text-button text-accent-on" : "text-button text-text-secondary"}>
                    {WALLET_TAB_LABEL[name]}
                    {list ? ` ${counts[name]}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error && !list ? (
            <ErrorState label="Vouchers not loaded" body={error} onRetry={read} />
          ) : !list && loading ? (
            <View className="gap-3" accessibilityLabel="Loading your vouchers">
              <SkeletonBlock className="h-32 w-full rounded-card" />
              <SkeletonBlock className="h-32 w-full rounded-card" />
            </View>
          ) : vouchers.length ? (
            <View className="gap-3">
              {vouchers.map((voucher) => {
                const state = voucherState(voucher, now, cartId);
                const usable = state.kind === "ready" || (state.kind === "held" && state.onThisBasket);
                return (
                  <VoucherTicket
                    key={voucher.id}
                    voucher={voucher}
                    cartId={cartId}
                    action={
                      usable ? (
                        <TicketAction
                          label={state.kind === "held" ? "Go to your order" : "Use now"}
                          accessibilityLabel={
                            state.kind === "held" ? "Go to your order" : `Use ${voucherTitle(voucher)} now`
                          }
                          onPress={openOrder}
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </View>
          ) : list ? (
            <EmptyState {...EMPTY[tab]} {...(tab === "available" ? { onAction: () => router.push("/request/category") } : {})} />
          ) : null}

          {error && list ? <Text className="text-caption text-error">{error}</Text> : null}
        </View>

        <Text className="text-caption text-text-muted">{VOUCHER_TERMS}</Text>
      </View>
    </FormScreen>
  );
}

const EMPTY: Record<WalletTab, { title: string; body: string; actionLabel?: string }> = {
  available: {
    title: "No vouchers to use",
    body: "When GRIDGO gives you one, or you add a code above, it shows here and comes off your next order.",
    actionLabel: "Start a print job",
  },
  used: { title: "Nothing used yet", body: "Vouchers you have used on an order are kept here." },
  expired: { title: "Nothing expired", body: "A voucher that runs out before it is used moves here." },
};
