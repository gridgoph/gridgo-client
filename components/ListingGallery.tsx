import { useRef, useState } from "react";
import {
  FlatList,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { PhotoThumbStrip } from "@/components/PhotoThumbStrip";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SamplePhotoViewer, type ViewerPhoto } from "@/components/SamplePhotoViewer";
import type { CatalogPhoto } from "@/lib/api";
import {
  clampPhotoIndex,
  pageAtOffset,
  photoPositionLabel,
} from "@/lib/gallery";
import { samplePhotoUri } from "@/lib/listing";

type Props = {
  photos: CatalogPhoto[];
  /** The listing's name, for photos the shop gave no description. */
  name: string;
  /** Asks the sheet for fresh links when one has expired. */
  onStale?: () => Promise<unknown> | void;
};

/**
 * The listing sheet's samples as one swipeable gallery.
 *
 * Every photo is a full-width page of the same crop-mark board, so a client
 * turns through the shop's work at a readable size. The thumbnail strip under
 * it shows every photo at once, rings the one in view as they swipe, and jumps
 * to one on a tap. A tap on the page opens the full-screen viewer on that
 * photo, which swipes the same way, pinches to zoom and carries the same
 * strip. Closing the viewer leaves the gallery on the photo they were last
 * looking at.
 *
 * A screen reader steps through the photos on the position control (swiping
 * is not an accessible gesture), the same way the viewer's counter works.
 */
export function ListingGallery({ photos, name, onStale }: Props) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const listRef = useRef<FlatList<CatalogPhoto>>(null);
  // A thumbnail tap glides past the pages between; the ring waits for the
  // page it was sent to rather than flickering through each one.
  const jumpingTo = useRef<number | null>(null);
  const count = photos.length;
  const shown = clampPhotoIndex(index, count);

  const altOf = (photo: CatalogPhoto | undefined) => photo?.altText || name;

  if (count <= 1) {
    return (
      <View className="bg-surface-variant px-2 pt-2">
        <SamplePhoto
          url={samplePhotoUri(photos[0])}
          expiresAt={photos[0]?.downloadUrlExpiresAt}
          onStale={onStale}
          altText={altOf(photos[0])}
          ratio="wide"
          emptyLabel="No sample photo"
        />
      </View>
    );
  }

  // The viewer only pages through photos that have a link; a page whose link
  // is missing is the "No sample photo" plate and opens nothing.
  const viewable = photos.flatMap((photo, page) => {
    const uri = samplePhotoUri(photo);
    return uri ? [{ uri, alt: altOf(photo), page }] : [];
  });
  const viewerPhotos: ViewerPhoto[] = viewable.map(({ uri, alt }) => ({ uri, alt }));

  const goTo = (page: number, animated: boolean) => {
    const target = clampPhotoIndex(page, count);
    setIndex(target);
    if (width <= 0) return;
    jumpingTo.current = animated && target !== shown ? target : null;
    listRef.current?.scrollToOffset({ offset: target * width, animated });
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next === width) return;
    setWidth(next);
    // Keep the same photo in frame if the sheet is laid out again.
    listRef.current?.scrollToOffset({ offset: shown * next, animated: false });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageAtOffset(event.nativeEvent.contentOffset.x, width, count);
    if (jumpingTo.current !== null) {
      if (next === jumpingTo.current) jumpingTo.current = null;
      return;
    }
    if (next !== index) setIndex(next);
  };

  const page = (photo: CatalogPhoto, pageIndex: number) => {
    const viewerIndex = viewable.findIndex((entry) => entry.page === pageIndex);
    return (
      <SamplePhoto
        url={samplePhotoUri(photo)}
        expiresAt={photo.downloadUrlExpiresAt}
        onStale={onStale}
        altText={altOf(photo)}
        ratio="wide"
        emptyLabel="No sample photo"
        onOpen={viewerIndex >= 0 ? () => setViewerAt(viewerIndex) : undefined}
      />
    );
  };

  return (
    <View className="bg-surface-variant pt-2" testID="listing-gallery">
      <View testID="listing-gallery-pager" onLayout={onLayout}>
        {width > 0 ? (
          <FlatList
            testID="listing-gallery-list"
            ref={listRef}
            data={photos}
            horizontal
            pagingEnabled
            disableIntervalMomentum
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            keyExtractor={(photo) => photo.fileId}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onScroll={onScroll}
            onScrollBeginDrag={() => (jumpingTo.current = null)}
            scrollEventThrottle={16}
            initialNumToRender={2}
            windowSize={3}
            renderItem={({ item, index: pageIndex }) => (
              <View className="px-2" style={{ width }}>
                {page(item, pageIndex)}
              </View>
            )}
          />
        ) : (
          // One frame before the band is measured: the first page, same size,
          // so the pager does not jump in.
          <View className="px-2">{page(photos[0], 0)}</View>
        )}
      </View>

      <View
        testID="listing-gallery-position"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={photoPositionLabel(shown, count)}
        accessibilityHint="Swipe up or down to change the photo"
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") goTo(shown + 1, true);
          if (event.nativeEvent.actionName === "decrement") goTo(shown - 1, true);
        }}
        className="py-2"
      >
        <PhotoThumbStrip
          photos={photos.map((photo) => ({ uri: samplePhotoUri(photo), key: photo.fileId }))}
          selected={shown}
          onSelect={(page) => goTo(page, true)}
          testIDPrefix="listing-gallery"
        />
      </View>

      <SamplePhotoViewer
        photos={viewerPhotos}
        index={viewerAt ?? 0}
        open={viewerAt !== null}
        onClose={(last) => {
          setViewerAt(null);
          const backTo = viewable[last]?.page;
          if (backTo !== undefined && backTo !== shown) goTo(backTo, false);
        }}
      />
    </View>
  );
}
