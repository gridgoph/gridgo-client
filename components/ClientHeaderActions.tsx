import { View } from "react-native";
import { useRouter } from "expo-router";

import { CartButton } from "@/components/CartButton";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { cartLineCount, useCart } from "@/store/cart";

/**
 * Cart and the light/dark switch, as one object, for every tab header.
 *
 * Same pair, same labels, same destinations on Home and on every other tab —
 * a control you learn once. Chat is not here: it lives in the "+" sheet's
 * quick actions, with its unread count.
 */
export function ClientHeaderActions() {
  const router = useRouter();
  const count = useCart(cartLineCount);

  return (
    <View className="flex-row items-center gap-3">
      <CartButton count={count} onPress={() => router.push("/checkout")} />
      <ThemeSwitch />
    </View>
  );
}
