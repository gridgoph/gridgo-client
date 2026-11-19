import { usePreventRemove } from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { ExpressStepBar } from "@/components/express/ExpressChrome";
import { FilesStep } from "@/components/express/FilesStep";
import { PayFooter, PayStep } from "@/components/express/PayStep";
import { PreviewFooter, PreviewStep } from "@/components/express/PreviewStep";
import { FormScreen } from "@/components/FormScreen";
import { GuideTarget } from "@/components/GuideTarget";
import * as api from "@/lib/api";
import { peekCurrentLocation } from "@/lib/deviceLocation";
import { expressFileProblem, looksRightHolds } from "@/lib/express";
import { expressChoices, useExpress, type ExpressStep } from "@/store/express";
import { usePlatformSettings } from "@/store/platformSettings";

const TITLES: Record<ExpressStep, string> = { files: "Your files", preview: "Preview", pay: "Pay" };
const PREVIOUS: Record<ExpressStep, ExpressStep | null> = { files: null, preview: "files", pay: "preview" };
/** Long enough to let a stepper settle, short enough that the price follows the finger. */
const DRAFT_SETTLE_MS = 450;

/**
 * Express document printing (gridgo-client#442): Files → Preview → Pay on
 * one route, so a half-built order never travels through URL params and the
 * back gesture steps back through the flow before it leaves.
 *
 * Opened from Home's Express tile and the Docs badge (gridgo-client#441).
 * How to order draws its sample on this same route (`sample`).
 */
export default function ExpressScreen() {
  const step = useExpress((state) => state.step);
  const files = useExpress((state) => state.files);
  const uploads = useExpress((state) => state.uploads);
  const prints = useExpress((state) => state.prints);
  const supplierId = useExpress((state) => state.supplierId);
  const fulfilment = useExpress((state) => state.fulfilment);
  const place = useExpress((state) => state.place);
  const tickedKey = useExpress((state) => state.tickedKey);
  const leaving = useExpress((state) => state.leaving);
  // How to order is drawing its sample here: it moves the steps itself.
  const sample = useExpress((state) => state.sample);

  const filesReady = files.length > 0 && uploads.length === 0 && files.every((file) => !expressFileProblem(file));
  const ticked = looksRightHolds(tickedKey, expressChoices({ prints, supplierId, fulfilment, place }));
  const canGo = (target: ExpressStep) =>
    target === "files" || (target === "preview" ? filesReady : filesReady && ticked);

  usePreventRemove(step !== "files" && !leaving && !sample, () => {
    const previous = PREVIOUS[useExpress.getState().step];
    if (previous) useExpress.getState().goTo(previous);
  });

  // Where the client is, without asking: the default saved place, else a
  // location the phone already shares. Pay's place row asks on a tap.
  useEffect(() => {
    void usePlatformSettings.getState().load().catch(() => undefined);
    if (sample || useExpress.getState().place) return;
    let alive = true;
    void (async () => {
      const addresses = await api.listAddresses().catch(() => [] as api.ClientAddress[]);
      const saved = addresses.find((row) => row.isDefault) ?? addresses[0];
      if (!alive || useExpress.getState().place) return;
      if (saved) {
        useExpress.getState().setPlace({
          lat: saved.point.lat,
          lng: saved.point.lng,
          label: saved.addressLine || saved.label,
          addressId: saved.id,
        });
        return;
      }
      const here = await peekCurrentLocation();
      if (alive && here?.status === "ok" && !useExpress.getState().place) {
        useExpress.getState().setPlace({ lat: here.point.lat, lng: here.point.lng, label: "My location", addressId: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sample]);

  // A leftover flow is dropped when the route goes.
  useEffect(() => () => useExpress.getState().reset(), []);

  // Every change makes a fresh draft once the settings settle: that is what
  // prices the order, and what the server's preview fingerprint checks.
  useEffect(() => {
    if (step === "files" || !filesReady) return;
    const timer = setTimeout(() => void useExpress.getState().refreshDraft(), DRAFT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [step, filesReady, prints, supplierId, fulfilment, place]);

  const footer =
    step === "files" ? (
      <View className="border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
        <Pressable
          onPress={() => useExpress.getState().goTo("preview")}
          disabled={!filesReady}
          accessibilityRole="button"
          accessibilityState={{ disabled: !filesReady }}
          className={filesReady ? "gg-btn-primary" : "gg-btn-primary gg-disabled"}
        >
          <Text className="text-button text-action-yellow-on">Continue</Text>
        </Pressable>
      </View>
    ) : step === "preview" ? (
      <GuideTarget step="express.preview">
        <PreviewFooter onContinue={() => useExpress.getState().goTo("pay")} />
      </GuideTarget>
    ) : (
      <PayFooter />
    );

  return (
    <FormScreen footer={footer} contentContainerStyle={{ paddingBottom: 12 }}>
      <Stack.Screen options={{ title: TITLES[step], gestureEnabled: !sample }} />
      <ExpressStepBar step={step} canGo={canGo} onStep={(target) => useExpress.getState().goTo(target)} />
      <View className="gg-page pt-1">
        {step === "files" ? <FilesStep /> : step === "preview" ? <PreviewStep /> : <PayStep />}
      </View>
    </FormScreen>
  );
}
