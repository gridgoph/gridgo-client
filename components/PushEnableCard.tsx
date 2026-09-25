import { Bell } from "lucide-react-native";
import { Linking, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { hasActiveSession } from "@/lib/sessionGuard";
import { pushOffer, pushOfferCopy } from "@/lib/push";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";

/**
 * The invitation to turn on phone notifications.
 *
 * This card and `PushExplainerSheet` are the only things in the app that can
 * raise the system permission dialog, and both only from a tap. Android 13+
 * shows that dialog once or twice and then treats a refusal as permanent, so
 * firing it cold on first launch — before anyone knows what GRIDGO is — spends
 * the ask on a stranger. The explainer makes the ask once a client has landed;
 * this card is the way back for anyone who said "Not now", drawn where the
 * value is already obvious and saying in one line what will arrive.
 *
 * Where it is drawn is this app's decision, and it is three signed-in places:
 *
 * - **Home**, the screen every client lands on, so turning notifications on
 *   never depends on finding a secondary screen. Without it almost nobody on
 *   Android 13+ registered at all.
 * - **The Notifications tab**, where a customer is already reading the things
 *   push would deliver.
 * - **An order waiting on somebody else**, where "we will tell you" is worth
 *   something rather than an interruption.
 *
 * The public login screen must not import this card. Expo Go Android SDK 53
 * throws when `expo-notifications` is first imported, and this card pulls in
 * the push store. Alerts belong on signed-in surfaces.
 *
 * Refusal is a first-class outcome. Nothing is blocked, no screen changes, and
 * the in-app list keeps every update: the card simply becomes a pointer to the
 * phone's own settings, which is the only place a blocked permission can be
 * taken back.
 *
 * A `SecondaryButton`, never the yellow one: the primary action on any screen
 * this appears on belongs to the job, not to a notification setting.
 */
type Props = {
  /**
   * Which side carries the gap to the rest of the screen.
   *
   * The card owns its own margin rather than sitting in a wrapper, because it
   * draws nothing most of the time — a wrapper would leave 24px of empty page
   * on every phone that has already granted permission, which is all of them
   * after the first tap. None of the screens it appears on is a gap container.
   * `section` is Home's rhythm, where every block opens 32px below the last.
   */
  spacing?: "above" | "below" | "section";
};

const SPACING = {
  above: "gg-panel mt-6 gap-3",
  below: "gg-panel mb-6 gap-3",
  section: "gg-panel mt-8 gap-3",
} as const satisfies Record<NonNullable<Props["spacing"]>, string>;

export function PushEnableCard({ spacing }: Props) {
  const colors = useThemeColors();
  const supported = usePush((s) => s.supported);
  const permission = usePush((s) => s.permission);
  const busy = usePush((s) => s.busy);
  const error = usePush((s) => s.error);
  const enable = usePush((s) => s.enable);
  const registerIfGranted = usePush((s) => s.registerIfGranted);
  const signedIn = hasActiveSession(useSession((s) => s.user));

  const offer = pushOffer({ supported, signedIn, permission, failed: Boolean(error) });
  if (offer === "hidden") return null;

  const copy = pushOfferCopy(offer, signedIn);

  return (
    <View
      className={spacing ? SPACING[spacing] : "gg-panel gap-3"}
    >
      <View className="flex-row items-center gap-2">
        <Bell size={18} color={colors.textSecondary} />
        <Text className="text-body-lg font-medium text-text-primary">{copy.title}</Text>
      </View>
      <Text className="text-body text-text-secondary">{copy.body}</Text>
      <SecondaryButton
        label={busy ? "Asking…" : copy.action}
        disabled={busy}
        onPress={() => {
          if (offer === "settings") {
            // Only the OS can undo a blocked permission, so this is an honest
            // handover rather than a dialog the app cannot actually raise.
            void Linking.openSettings();
            return;
          }
          // Permission is already granted in the retry case, so asking again
          // would raise nothing; what failed was the registration.
          if (offer === "retry") {
            void registerIfGranted();
            return;
          }
          void enable();
        }}
      />
    </View>
  );
}
