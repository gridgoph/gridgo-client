import { Pressable, Text, View } from "react-native";
import { formatPhp } from "@/lib/api";

export function CashCheckoutChoice({ selected, onChoose, disabled }: { selected: boolean; onChoose: (cash: boolean) => void; disabled: boolean }) {
  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel="Payment method">
      {([false, true] as const).map((cash) => (
        <Pressable key={String(cash)} onPress={() => onChoose(cash)} disabled={disabled}
          accessibilityRole="radio" accessibilityState={{ selected: selected === cash, checked: selected === cash, disabled }}
          className={selected === cash ? "gg-panel-high gg-touch border-text-primary" : "gg-panel gg-touch"}>
          <Text className="text-button text-text-primary">{cash ? "Cash on delivery" : "Pay online by QR"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function CashCheckoutNote({ amountMinor, multi }: { amountMinor: number; multi: boolean }) {
  return (
    <View className="gg-card gap-3">
      <Text className="text-h3 text-text-primary">Have {formatPhp(amountMinor)} ready</Text>
      <Text className="text-body text-text-secondary">Pay the rider the exact cash when your order arrives, then sign the acknowledgement receipt. A digital invoice is issued for your order.</Text>
      {multi ? <Text className="text-body text-text-secondary">Each delivery collects its own part of this total. Your orders show the amount for each delivery.</Text> : null}
      <Text className="text-caption text-text-muted">If a missed delivery or refusal is approved by Operations, cash becomes unavailable until you repay the order and fare online. Redelivery is at your cost.</Text>
    </View>
  );
}
