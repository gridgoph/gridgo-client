import { ShoppingBag } from "lucide-react-native";

import { HeaderIconButton } from "@/components/HeaderIconButton";

type Props = {
  count: number;
  onPress: () => void;
};

/**
 * The way back into a basket that is already started.
 *
 * Home is where a client lands after leaving checkout to add one more thing,
 * and until now nothing on it said the basket was still there. The count is
 * the whole point of the control: an empty bag is a door, a bag with 3 on it
 * is a reminder.
 *
 * Geometry and the badge live in `HeaderIconButton`, which Chat shares — the
 * two sit side by side in every tab header and have to be the same object.
 * What stays here is the only thing that is Cart's alone: the label, which
 * says what is in the bag rather than what the control is called.
 */
export function CartButton({ count, onPress }: Props) {
  return (
    <HeaderIconButton
      icon={ShoppingBag}
      count={count}
      onPress={onPress}
      accessibilityLabel={
        count === 0
          ? "Your order, empty"
          : count === 1
            ? "Your order, 1 item"
            : `Your order, ${count} items`
      }
    />
  );
}
