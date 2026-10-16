import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useNavigation } from "expo-router";

/**
 * The longest a screen waits for its push to say it has finished. A stack
 * transition runs ~350 ms; past this the moment starts anyway, so nothing is
 * ever held behind an event that never came.
 */
export const SCREEN_SHOWN_FALLBACK_MS = 450;

/** The one native-stack event this reads; the default navigation type omits it. */
type TransitionEvents = {
  addListener: (
    type: "transitionEnd",
    listener: (event: { data?: { closing?: boolean } }) => void,
  ) => () => void;
};

/**
 * True once this screen has finished sliding in.
 *
 * A moment that starts on mount plays under the push transition, and on a slow
 * phone the frames it needed are the ones the transition spent — the receipt's
 * print came to rest before anyone could see it move (#229). Web pushes
 * without a transition, so it is shown from the first frame.
 */
export function useScreenShown(): boolean {
  const navigation = useNavigation() as unknown as TransitionEvents;
  const [shown, setShown] = useState(Platform.OS === "web");

  useEffect(() => {
    if (shown) return;
    const show = () => setShown(true);
    const timer = setTimeout(show, SCREEN_SHOWN_FALLBACK_MS);
    const unsubscribe = navigation.addListener("transitionEnd", (event) => {
      if (!event.data?.closing) show();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [navigation, shown]);

  return shown;
}
