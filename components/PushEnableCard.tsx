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
 * This card is the *only* thing in the app that can raise the system
 * permission dialog. Android 13+ shows that dialog once and treats a refusal as
 * effectively permanent, so firing it cold on first launch — before anyone
 * knows what GRIDGO is — spends the one ask on a stranger. Instead the card is
 * drawn where the value is already obvious and states in one line what will
 * arrive; the dialog follows a deliberate tap and nothing else.
 *
 * Refusal is a first-class outcome. Nothing is blocked, no screen changes, and
 * the in-app list keeps every update: the card simply becomes a pointer to the
 * phone's own settings, which is the only place a blocked permission can be
 * taken back.
 *
 * A `SecondaryButton`, never the yellow one: the primary action on any screen
 * this appears on belongs to the job, not to a notification setting.
 */
export function PushEnableCard() {
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

  const copy = pushOfferCopy(offer);

  return (
    <View className="gg-panel gap-3">
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
