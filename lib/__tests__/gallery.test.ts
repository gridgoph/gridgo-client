import {
  GALLERY_MAX_DOTS,
  clampPhotoIndex,
  galleryIndicator,
  pageAtOffset,
  photoPositionLabel,
} from "@/lib/gallery";

describe("gallery paging", () => {
  it("keeps an index inside the gallery", () => {
    expect(clampPhotoIndex(-1, 4)).toBe(0);
    expect(clampPhotoIndex(2, 4)).toBe(2);
    expect(clampPhotoIndex(9, 4)).toBe(3);
    expect(clampPhotoIndex(1, 0)).toBe(0);
    expect(clampPhotoIndex(Number.NaN, 3)).toBe(0);
  });

  it("turns the page once the next photo's middle crosses the frame", () => {
    expect(pageAtOffset(0, 390, 3)).toBe(0);
    expect(pageAtOffset(194, 390, 3)).toBe(0);
    expect(pageAtOffset(196, 390, 3)).toBe(1);
    expect(pageAtOffset(780, 390, 3)).toBe(2);
    // An Android overscroll past the last page never names a fourth photo.
    expect(pageAtOffset(900, 390, 3)).toBe(2);
    expect(pageAtOffset(100, 0, 3)).toBe(0);
  });

  it("says the position in words", () => {
    expect(photoPositionLabel(0, 5)).toBe("Photo 1 of 5");
    expect(photoPositionLabel(7, 5)).toBe("Photo 5 of 5");
  });

  it("draws dots for a listing's photos and a counter past them", () => {
    expect(galleryIndicator(0)).toBe("none");
    expect(galleryIndicator(1)).toBe("none");
    expect(galleryIndicator(2)).toBe("dots");
    // gridgo-api allows eight sample photos a listing; all of them get a dot.
    expect(galleryIndicator(8)).toBe("dots");
    expect(galleryIndicator(GALLERY_MAX_DOTS + 1)).toBe("counter");
  });
});
