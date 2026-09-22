import { MessageSquare } from "lucide-react-native";

import { HeaderIconButton } from "@/components/HeaderIconButton";

type Props = {
  onPress: () => void;
  /** Unread from Operations. Omit when the count is zero. */
  count?: number;
};

/**
 * The way into Operations. A count is only a count — never a decorative dot.
 */
export function ChatButton({ onPress, count }: Props) {
  return (
    <HeaderIconButton
      icon={MessageSquare}
      accessibilityLabel="Chat"
      onPress={onPress}
      count={count}
    />
  );
}
