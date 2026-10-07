import { X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  FlatList,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { clampPhotoIndex, pageAtOffset, photoPositionLabel } from "@/lib/gallery";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export type ViewerPhoto = { uri: string; alt: string };

type Props = {
  photos: ViewerPhoto[];
  /** The photo the viewer opens on. */
  index?: number;
  open: boolean;
  /** Called with the photo the client was looking at when they closed it. */
  onClose: (lastIndex: number) => void;
};

/**
 * The samples, full screen, so a client can pinch in on the print and swipe
 * to the next one.
 *
 * The crop-mark tile is the board; this is the loupe. A React Native `Modal`
 * renders outside the app's gesture root, so the root is remounted here —
 * without it a pinch on Android is a no-op. PanResponder cannot express a
 * two-finger scale, which is why this is the one Modal that uses RNGH, and the
 * pager is RNGH's own `FlatList` so the swipe and the pinch negotiate in one
 * gesture system instead of the native scroll view stealing the second finger.
 * While a photo is zoomed the pager is locked, so a pan moves the print rather
 * than turning the page.
 */
export function SamplePhotoViewer({ photos, index = 0, open, onClose }: Props) {
  // The system back button closes the Modal from outside the stage, so the
  // page the stage is showing is mirrored here for it.
  const shownRef = useRef(index);
  if (photos.length === 0) return null;

  // Jest has no native Modal host and no gesture installer. The loupe is
  // still a real node so a press can be asserted; pinch lives on the device.
  if (process.env.NODE_ENV === "test") {
    if (!open) return null;
    return (
      <ViewerStage
        photos={photos}
        startIndex={index}
        onShown={(i) => (shownRef.current = i)}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onClose(shownRef.current)}
      statusBarTranslucent
    >
      {/* A Modal mounts its content only while visible, so the stage starts
          on the tapped photo every time it opens. */}
      <ViewerStage
        photos={photos}
        startIndex={index}
        onShown={(i) => (shownRef.current = i)}
        onClose={onClose}
      />
    </Modal>
  );
}

function ViewerStage({
  photos,
  startIndex,
  onShown,
  onClose,
}: {
  photos: ViewerPhoto[];
  startIndex: number;
  onShown: (index: number) => void;
  onClose: (lastIndex: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [start] = useState(() => clampPhotoIndex(startIndex, photos.length));
  const [current, setCurrent] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  // Bumped to remount every page at rest (see `ZoomablePhoto`).
  const [resets, setResets] = useState(0);
  const listRef = useRef<FlatList<ViewerPhoto>>(null);
  const count = photos.length;
  const shown = clampPhotoIndex(current, count);
  const isTest = process.env.NODE_ENV === "test";

  useEffect(() => {
    onShown(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reports the page, not the callback identity.
  }, [shown]);

  const close = () => onClose(shown);

  const goTo = (next: number) => {
    const target = clampPhotoIndex(next, count);
    if (zoomed) {
      setZoomed(false);
      setResets((n) => n + 1);
    }
    setCurrent(target);
    listRef.current?.scrollToIndex({ index: target, animated: true });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageAtOffset(event.nativeEvent.contentOffset.x, width, count);
    if (next !== current) setCurrent(next);
  };

  const closeButton = (
    <Pressable
      onPress={close}
      testID="close-sample-photo"
      accessibilityRole="button"
      accessibilityLabel="Close the photo"
      className="absolute items-center justify-center"
      style={{ top: insets.top + 8, right: 12, width: 44, height: 44 }}
    >
      <X size={22} color="#FFFFFF" strokeWidth={2} />
    </Pressable>
  );

  // The counter is the position for everyone: a sighted client reads "2 / 5",
  // and a screen reader gets a control it can step through, because swiping is
  // not an accessible gesture.
  const counter =
    count > 1 ? (
      <View
        testID="sample-photo-counter"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={photoPositionLabel(shown, count)}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") goTo(shown + 1);
          if (event.nativeEvent.actionName === "decrement") goTo(shown - 1);
        }}
        className="absolute justify-center rounded-pill px-3"
        style={{
          top: insets.top + 8,
          left: 12,
          height: 44,
        }}
      >
        <Text className="text-body font-medium" style={{ color: "#FFFFFF" }}>
          {shown + 1} / {count}
        </Text>
      </View>
    ) : null;

  if (isTest) {
    const photo = photos[shown];
    return (
      <View style={{ flex: 1 }} testID="sample-photo-viewer" accessibilityViewIsModal>
        <View className="flex-1 items-center justify-center bg-black">
          <Animated.Image
            testID="sample-photo-viewer-image"
            source={{ uri: photo.uri }}
            accessibilityLabel={photo.alt}
            resizeMode="contain"
            style={{ width, height }}
          />
        </View>
        {counter}
        {closeButton}
      </View>
    );
  }

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: "#000000" }}
      testID="sample-photo-viewer"
      accessibilityViewIsModal
    >
      <FlatList
        ref={listRef}
        data={photos}
        horizontal
        pagingEnabled
        disableIntervalMomentum
        scrollEnabled={!zoomed && count > 1}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(photo, i) => `${resets}:${i}:${photo.uri}`}
        onScroll={onScroll}
        scrollEventThrottle={16}
        windowSize={3}
        initialNumToRender={1}
        renderItem={({ item, index: page }) => (
          <ZoomablePhoto
            uri={item.uri}
            alt={item.alt}
            width={width}
            height={height}
            zoomed={zoomed && page === shown}
            onZoomChange={setZoomed}
            onTap={close}
          />
        )}
      />
      {counter}
      {closeButton}
    </GestureHandlerRootView>
  );
}

/**
 * One page of the viewer: pinch to zoom, pan while zoomed, double-tap to zoom
 * in or out, a single tap at rest to close. The pager is locked while a page
 * is zoomed, so a swipe never leaves one zoomed into a corner; stepping from
 * the screen reader's counter remounts the pages for the same reason.
 */
function ZoomablePhoto({
  uri,
  alt,
  width,
  height,
  zoomed,
  onZoomChange,
  onTap,
}: {
  uri: string;
  alt: string;
  width: number;
  height: number;
  /** Only the page in view can be zoomed, so this is the viewer's flag. */
  zoomed: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
}) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      const next = startScale.value * event.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        scale.value = withSpring(MIN_SCALE);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        runOnJS(onZoomChange)(false);
        return;
      }
      runOnJS(onZoomChange)(true);
    });

  // Only a zoomed photo pans; at rest a horizontal drag belongs to the pager.
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(MIN_SCALE);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        runOnJS(onZoomChange)(false);
        return;
      }
      scale.value = withSpring(2);
      runOnJS(onZoomChange)(true);
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    if (scale.value <= 1.05) runOnJS(onTap)();
  });

  const gesture = Gesture.Simultaneous(
    pinch,
    Gesture.Exclusive(doubleTap, singleTap, pan),
  );

  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        className="items-center justify-center overflow-hidden"
        style={{ width, height }}
      >
        <Animated.Image
          source={{ uri }}
          accessibilityLabel={alt}
          resizeMode="contain"
          style={[{ width, height }, photoStyle]}
        />
      </Animated.View>
    </GestureDetector>
  );
}
