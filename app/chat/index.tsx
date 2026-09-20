import { SupportChatConversation } from "@/components/SupportChatConversation";
import { CHAT_THREADS } from "@/lib/chatThreads";

/**
 * The live conversation with Operations. There is one peer, so this list
 * route *is* the thread — a second screen that only named Operations would
 * be a tap for nothing.
 */
export default function ChatScreen() {
  const thread = CHAT_THREADS[0];
  return <SupportChatConversation peerName={thread.name} peerRole={thread.role} />;
}
