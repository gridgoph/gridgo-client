import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";

import { HeaderIconButton } from "@/components/HeaderIconButton";
import { bellLabel } from "@/lib/notificationNudge";
import { hasActiveSession } from "@/lib/sessionGuard";
import { legalGateFor, useLegalConsent } from "@/store/legalConsent";
import { useUnreadCount } from "@/store/notifications";
import { useSession } from "@/store/session";

/** Where the header bell goes: the inbox, pushed over the screen it was tapped on. */
export const INBOX_ROUTE = "/inbox";

/**
 * The notification bell in a pushed screen's header (#230).
 *
 * Tab screens already carry the bell in the tab bar; a pushed screen — an
 * order, checkout, a chat — hides the tab bar, and that was where updates
 * went out of reach. So every signed-in pushed screen carries this one, with
 * the same count as the tab, and it swings on each new update like the tab's.
 *
 * It opens the inbox *over* the screen it was tapped on rather than jumping
 * to the Notifications tab, which would throw away the order or the basket
 * the client was in the middle of. Back returns them to it.
 *
 * Same geometry and monochrome plate as Cart and Chat (`HeaderIconButton`).
 * Draws nothing signed out or while terms wait to be agreed, when the inbox
 * is not a place the client can go.
 */
export function HeaderNotificationBell() {
  const router = useRouter();
  const unread = useUnreadCount();
  const user = useSession((s) => s.user);
  const legalBlocked = useLegalConsent((state) => legalGateFor(state, user?.id) === "blocked");

  if (!hasActiveSession(user) || legalBlocked) return null;

  return (
    <HeaderIconButton
      icon={Bell}
      swing
      accessibilityLabel={bellLabel(unread)}
      count={unread > 0 ? unread : undefined}
      onPress={() => router.push(INBOX_ROUTE)}
    />
  );
}
