import { Platform, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import type { ReactNode, Ref } from "react";

import { Screen, type Edge } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The gap kept between the caret and the top of the keyboard.
 *
 * Enough that the line being typed is not pressed against the keyboard, and
 * enough that a field's helper or error line under it is still readable — the
 * sign-up form says why a field is wrong directly beneath it, and a rule you
 * cannot see while correcting it is not a rule you can follow.
 */
export const KEYBOARD_CARET_GAP = 28;

type Props = {
  /**
   * Which physical edges this screen owns. A screen under a visible header
   * never claims `"top"` — the header has already cleared the status bar.
   */
  edges?: readonly Edge[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  /**
   * Anything that belongs beside the scroll rather than inside it — the
   * dialogs and waits drawn over the screen (`ConfirmDialog`,
   * `LoadingOverlay`, `ReplaceDraftDialog`), and the `Stack.Screen` a
   * deep-linked route declares to give itself a way back.
   */
  overlay?: ReactNode;
  /** A commit bar that stays below the scroll, inside the safe area. */
  footer?: ReactNode;
  /** Lets a long form jump to the first missing field. */
  scrollRef?: Ref<{ scrollTo?: (opts: { y: number; animated?: boolean }) => void }>;
};

/**
 * The shell every screen with a text input opens through.
 *
 * The rule it exists to keep: **the field you are typing into stays visible,
 * and the button that submits the form is reachable without dismissing the
 * keyboard.** That is more than padding a container. React Native's
 * `KeyboardAvoidingView` shrinks or pads whatever it wraps and stops there — it
 * never scrolls, so on a form longer than a phone (sign-up's five fields, the
 * request stepper's specification and address) the correct amount of space
 * appeared at the bottom while the caret stayed under the keyboard. It also
 * takes a different `behavior` per platform, and under Android's edge-to-edge
 * — mandatory from Expo SDK 54 — `adjustResize` no longer shrinks the window,
 * so the `undefined` behavior this app passed there did nothing at all.
 *
 * `KeyboardAwareScrollView` reads the focused input's own frame and scrolls it
 * above the keyboard, then extends the scrollable area by the keyboard's height
 * so everything below the field — including the submit button — can still be
 * reached. One component, no per-platform behavior, no header offset to keep in
 * sync with the navigator.
 *
 * `keyboardShouldPersistTaps="handled"` is what makes tapping the background
 * dismiss the keyboard while a tap on a button still presses it, rather than
 * being swallowed as a dismissal. On Android a drag dismisses too; on iOS the
 * keyboard follows the finger, which is the platform's own gesture.
 *
 * On web every binding in the library is a no-op, so this is a plain
 * `ScrollView` there — which is honest, because a browser has no soft keyboard
 * to avoid.
 */
export function FormScreen({
  edges = BOTTOM_ONLY,
  contentContainerStyle,
  children,
  overlay,
  footer,
  scrollRef,
}: Props) {
  const colors = useThemeColors();

  return (
    <Screen edges={edges}>
      <KeyboardAwareScrollView
        ref={scrollRef as never}
        style={{ flex: 1, backgroundColor: colors.canvas }}
        contentContainerStyle={contentContainerStyle}
        bottomOffset={KEYBOARD_CARET_GAP}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {children}
      </KeyboardAwareScrollView>
      {footer}
      {overlay}
    </Screen>
  );
}

const BOTTOM_ONLY: readonly Edge[] = ["bottom"];
