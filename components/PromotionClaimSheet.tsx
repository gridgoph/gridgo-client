import { router, useSegments } from "expo-router";
import { CircleAlert, CircleCheck } from "lucide-react-native";
import { useEffect } from "react";
import { AppState, Text, View } from "react-native";

import { OfferTicket } from "@/components/OfferTicket";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";
import { useVisibleTourStep } from "@/hooks/useTourStep";
import { claimCopy, claimOffer, ONE_DISCOUNT_RULE } from "@/lib/promotions";
import { hasActiveSession } from "@/lib/sessionGuard";
import { VOUCHERS_ROUTE } from "@/lib/vouchers";
import { useAppUpdate } from "@/store/appUpdate";
import { useCall } from "@/store/call";
import { useCheckoutExit } from "@/store/checkoutExit";
import { useFoundingTester } from "@/store/foundingTester";
import { usePromotions } from "@/store/promotions";
import { usePushPrompt } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/**
 * "₱200 off your first order": the Founding 30 claim, or a Friend Pass a
 * Founder sent this client, offered once a signed-in client lands in the app.
 *
 * GRIDGO decides whether there is one (`GET /me/promotions`): none left, the
 * offer over, or a launch discount already held, and the sheet never opens.
 * "Not now" takes no slot and keeps the sheet away for this app session; the
 * next sign-in or launch offers it again while one is still there. Account →
 * Vouchers carries the same Redeem card meanwhile.
 *
 * Mounted once in the root layout and drawn only over the tab shell, after
 * the update prompt and the notification explainer, never over the checkout
 * question, a tour step or the Founding Tester celebration.
 */
export function PromotionClaimSheet({ ready }: { ready: boolean }) {
  const segments = useSegments();
  const onTabs = segments[0] === "(tabs)";
  const user = useSession((s) => s.user);
  const signedIn = hasActiveSession(user);
  const userId = signedIn ? (user?.id ?? null) : null;
  const data = usePromotions((s) => s.data);
  const sheet = usePromotions((s) => s.sheet);
  const dismissed = usePromotions((s) => s.dismissed);
  const pushPrompt = usePushPrompt((s) => s.open);
  const updatePrompt = useAppUpdate((s) => s.promptOpen || s.completed !== null);
  const exitQuestion = useCheckoutExit((s) => s.open);
  const celebration = useFoundingTester((s) => s.showing != null);
  const callActive = useCall((s) => s.session != null);
  const tour = useVisibleTourStep();
  const tourShowing = tour.step != null && tour.progress?.status === "active";

  // Read on sign-in and whenever the app comes back: slots run out meanwhile.
  useEffect(() => {
    if (!userId) return;
    void usePromotions.getState().load();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void usePromotions.getState().load();
    });
    return () => subscription.remove();
  }, [userId]);

  const offer = claimOffer(data);
  const clear = ready && onTabs && !pushPrompt && !updatePrompt && !exitQuestion && !celebration && !callActive && !tourShowing;

  useEffect(() => {
    if (!userId || !offer || !clear || dismissed.includes(offer.kind)) return;
    if (usePromotions.getState().sheet) return;
    usePromotions.getState().openSheet(offer);
  }, [userId, offer, clear, dismissed]);

  // Signed out with it up: there is nobody left to offer it to.
  useEffect(() => {
    if (sheet && !userId) usePromotions.getState().closeSheet();
  }, [sheet, userId]);

  return <ClaimSheet open={Boolean(sheet) && ready} />;
}

function ClaimSheet({ open }: { open: boolean }) {
  const colors = useThemeColors();
  const sheet = usePromotions((s) => s.sheet);
  const data = usePromotions((s) => s.data);
  const busy = usePromotions((s) => s.busy);
  const notice = usePromotions((s) => s.claimNotice);
  const dismiss = usePromotions((s) => s.dismissSheet);
  const close = usePromotions((s) => s.closeSheet);

  if (!sheet) return <Sheet open={false} title="" onClose={close}>{null}</Sheet>;

  const claimed = notice?.ok === true;
  // A refusal reads the offer again; if it has gone (sold out, ended), the
  // sheet says why and offers nothing more to press.
  const live = claimOffer(data);
  const stillOpen = live?.kind === sheet.kind;
  // While it can still be claimed, every word follows GRIDGO's latest answer:
  // an amount changed by Operations moves the title, the ticket and the
  // button together. Only a finished claim — or one gone — keeps the latch.
  const offer = live && stillOpen ? live : sheet;
  const copy = claimCopy(offer);
  const pending = busy === sheet.kind;

  return (
    <Sheet
      open={open}
      title={claimed ? "It's in your wallet" : copy.title}
      onClose={claimed || !stillOpen ? close : dismiss}
      maxHeightRatio={0.9}
    >
      <View className="gap-4 px-4 pt-2" testID="promotion-claim-sheet">
        <OfferTicket
          offer={offer}
          notchColor={colors.surface}
          showSlots={stillOpen && !claimed}
        />

        {claimed ? null : <Text className="text-body-lg text-text-secondary">{copy.body}</Text>}

        {notice ? (
          <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite" accessibilityRole={notice.ok ? "text" : "alert"}>
            <View className="pt-0.5">
              {notice.ok ? (
                <CircleCheck size={16} color={colors.success} strokeWidth={2} aria-hidden />
              ) : (
                <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
              )}
            </View>
            <Text className={`min-w-0 flex-1 text-body ${notice.ok ? "text-success" : "text-error"}`}>{notice.text}</Text>
          </View>
        ) : (
          <Text className="text-caption text-text-muted">{ONE_DISCOUNT_RULE}</Text>
        )}

        <View className="gap-3 pb-2">
          {claimed ? (
            <>
              <PrimaryButton
                label="See my vouchers"
                onPress={() => {
                  close();
                  router.push(VOUCHERS_ROUTE);
                }}
              />
              <SecondaryButton label="Done" onPress={close} />
            </>
          ) : stillOpen ? (
            <>
              <PrimaryButton
                label={pending ? "Adding to your wallet…" : copy.action}
                disabled={busy != null}
                onPress={() => void usePromotions.getState().claim(sheet.kind)}
              />
              <SecondaryButton label="Not now" disabled={pending} onPress={dismiss} />
            </>
          ) : (
            <SecondaryButton label="Close" onPress={close} />
          )}
        </View>
      </View>
    </Sheet>
  );
}
