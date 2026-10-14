import { Clipboard, Platform } from "react-native";

/**
 * Puts text on the clipboard. Resolves whether it got there.
 *
 * React Native 0.86 still ships its own clipboard module, so this needs no
 * new native dependency (gridgo-rider's `lib/copyAddress.ts` does the same).
 * A browser gets the asynchronous Clipboard API first; react-native-web's
 * `setString` is the fallback. Never throws: a copy that fails leaves the
 * text on screen, selectable, which is still a way to take it.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
