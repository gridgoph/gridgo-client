import { MessageSquare } from "lucide-react-native";

import { HeaderIconButton } from "@/components/HeaderIconButton";

type Props = {
  onPress: () => void;
};

/**
 * The way into the people attached to a job — supplier, rider, Gridbot.
 *
 * No count and no dot. GRIDGO is not carrying messages yet, so there is no
 * unread number to show; a badge here would be decoration pretending to be
 * data, which is the one thing this app does not do. When messages are real,
 * a count goes through `HeaderIconButton`'s `count` prop exactly as Cart's
 * does, and nothing else here changes.
 */
export function ChatButton({ onPress }: Props) {
  return (
    <HeaderIconButton icon={MessageSquare} accessibilityLabel="Chat" onPress={onPress} />
  );
}
