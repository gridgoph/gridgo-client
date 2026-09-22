import { View } from "react-native";
import { useRouter } from "expo-router";

import { CartButton } from "@/components/CartButton";
import { ChatButton } from "@/components/ChatButton";
import { cartLineCount, useCart } from "@/store/cart";
import { useSupportChatStore } from "@/store/supportChat";

/**
 * Cart and chat, as one object, for every tab header.
 *
 * They used to live only on Home, which meant the rest of the app had no way
 * back into a basket or a thread without leaving the screen you were on.
 * Same pair, same labels, same destinations — a control you learn once.
 */
export function ClientHeaderActions() {
  const router = useRouter();
  const count = useCart(cartLineCount);
  const unread = useSupportChatStore((s) => s.unreadCount);

  return (
    <View className="flex-row items-center">
      <CartButton count={count} onPress={() => router.push("/checkout")} />
      <ChatButton
        onPress={() => router.push("/chat")}
        count={unread > 0 ? unread : undefined}
      />
    </View>
  );
}
