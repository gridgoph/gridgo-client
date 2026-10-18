import { useCallback, useRef } from "react";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";

import { isAtChatEnd, shouldRepinOnResize } from "@/lib/chatScroll";

/**
 * Keeps an order conversation's newest message in view while the reader is at
 * the end, and leaves them alone once they scroll up to read history
 * (`lib/chatScroll.ts`, gridgo-client#128).
 */
export function useChatTranscriptEnd() {
  const listRef = useRef<ScrollView>(null);
  const followingEnd = useRef(true);
  const viewportHeight = useRef<number | null>(null);

  const trackEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    followingEnd.current = isAtChatEnd({
      offsetY: contentOffset.y,
      viewportHeight: layoutMeasurement.height,
      contentHeight: contentSize.height,
    });
  }, []);

  const keepEndInView = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (shouldRepinOnResize(viewportHeight.current, next, followingEnd.current)) {
      listRef.current?.scrollToEnd({ animated: false });
    }
    viewportHeight.current = next;
  }, []);

  /** After new messages land: follow them only if the reader was at the end. */
  const followNewMessages = useCallback((animated: boolean) => {
    if (followingEnd.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  /** After the client sends: their own message always comes into view. */
  const jumpToEnd = useCallback(() => {
    followingEnd.current = true;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  return { listRef, trackEnd, keepEndInView, followNewMessages, jumpToEnd };
}
