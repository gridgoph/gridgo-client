import type { CatalogItem } from "@/lib/api";
import {
  HELD_READ_MAX_AGE_MS,
  PHOTO_LINK_MARGIN_MS,
  boardListings,
  earliestPhotoExpiry,
  hasStalePhotoLink,
  heldReadIsStale,
  photoLinkIsStale,
  withFreshPhotos,
} from "@/lib/photoLinks";

const NOW = Date.parse("2026-09-27T08:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function listing(id: string, ...expiries: (string | undefined)[]): Pick<CatalogItem, "id" | "photos"> {
  return {
    id,
    photos: expiries.map((downloadUrlExpiresAt, index) => ({
      fileId: `${id}_${index}`,
      sortOrder: index,
      altText: null,
      url: `/catalog/media/${id}_${index}`,
      downloadUrl: `https://storage.example/${id}_${index}`,
      downloadUrlExpiresAt,
    })),
  };
}

describe("photoLinkIsStale", () => {
  it("calls an expired link stale", () => {
    expect(photoLinkIsStale({ downloadUrlExpiresAt: at(-1_000) }, NOW)).toBe(true);
  });

  it("calls a link inside the margin stale before it expires", () => {
    expect(photoLinkIsStale({ downloadUrlExpiresAt: at(PHOTO_LINK_MARGIN_MS - 1) }, NOW)).toBe(true);
    expect(photoLinkIsStale({ downloadUrlExpiresAt: at(PHOTO_LINK_MARGIN_MS + 1_000) }, NOW)).toBe(false);
  });

  it("never guesses about a link that carries no expiry", () => {
    expect(photoLinkIsStale({}, NOW)).toBe(false);
    expect(photoLinkIsStale({ downloadUrlExpiresAt: null }, NOW)).toBe(false);
    expect(photoLinkIsStale({ downloadUrlExpiresAt: "not a date" }, NOW)).toBe(false);
    expect(photoLinkIsStale(null, NOW)).toBe(false);
  });
});

describe("earliestPhotoExpiry", () => {
  it("finds the soonest link across listings and skips unstamped photos", () => {
    const items = [listing("a", at(200_000), undefined), null, listing("b", at(90_000))];
    expect(earliestPhotoExpiry(items)).toBe(NOW + 90_000);
    expect(hasStalePhotoLink(items, NOW)).toBe(false);
    expect(hasStalePhotoLink(items, NOW + 70_000)).toBe(true);
  });

  it("is null when nothing says when it expires", () => {
    expect(earliestPhotoExpiry([listing("a", undefined)])).toBeNull();
    expect(hasStalePhotoLink([listing("a", undefined)], NOW)).toBe(false);
  });
});

describe("heldReadIsStale", () => {
  it("re-reads a read older than four minutes even with no expiry stamped", () => {
    expect(heldReadIsStale({ readAt: NOW - HELD_READ_MAX_AGE_MS, earliestExpiry: null }, NOW)).toBe(true);
    expect(heldReadIsStale({ readAt: NOW - 60_000, earliestExpiry: null }, NOW)).toBe(false);
  });

  it("re-reads a young read whose soonest link is stale", () => {
    expect(heldReadIsStale({ readAt: NOW - 10_000, earliestExpiry: NOW + 5_000 }, NOW)).toBe(true);
  });

  it("does nothing when nothing is held", () => {
    expect(heldReadIsStale({ readAt: null, earliestExpiry: NOW - 1 }, NOW)).toBe(false);
  });
});

describe("withFreshPhotos", () => {
  it("swaps in photos by listing id and leaves the rest of the listing alone", () => {
    const held = [
      { ...listing("a", at(-1_000)), name: "Held A" },
      { ...listing("gone", at(-1_000)), name: "Taken down" },
    ];
    const fresh = [listing("a", at(300_000))];
    const next = withFreshPhotos(held, fresh);
    expect(next[0].name).toBe("Held A");
    expect(next[0].photos).toBe(fresh[0].photos);
    expect(next[1]).toBe(held[1]);
  });
});

describe("boardListings", () => {
  it("flattens every service's listings", () => {
    const a = listing("a") as CatalogItem;
    const b = listing("b") as CatalogItem;
    expect(boardListings([{ services: [{ items: [a] }, { items: [b] }] }])).toEqual([a, b]);
  });
});
