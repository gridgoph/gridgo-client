import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ListingGallery } from "@/components/ListingGallery";
import type { CatalogPhoto } from "@/lib/api";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function photo(n: number, altText: string | null = `Sample ${n}`): CatalogPhoto {
  return {
    fileId: `file_${n}`,
    sortOrder: n,
    altText,
    url: `/catalog/media/file_${n}`,
    downloadUrl: `https://cdn.example/sample-${n}.jpg`,
    downloadUrlExpiresAt: "2999-01-01T00:00:00.000Z",
  };
}

async function renderGallery(photos: CatalogPhoto[]) {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListingGallery photos={photos} name="Glossy flyers" />
    </SafeAreaProvider>,
  );
  return view;
}

async function measure(width = 390) {
  await fireEvent(screen.getByTestId("listing-gallery-pager"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 300 } },
  });
}

// One interaction per test, and the interacting tests go last (AGENTS.md:
// a second press empties every later render in the file).
describe("ListingGallery", () => {
  it("draws one photo alone, with no dots", async () => {
    const view = await renderGallery([photo(1)]);

    expect(screen.getByLabelText("Sample 1")).toBeTruthy();
    expect(screen.queryByTestId("listing-gallery-position")).toBeNull();
    expect(screen.queryByTestId("listing-gallery-dot-active")).toBeNull();
    await view.unmount();
  });

  it("says no sample when a listing has no photos", async () => {
    const view = await renderGallery([]);

    expect(screen.getByText("No sample photo")).toBeTruthy();
    await view.unmount();
  });

  it("puts a dot under the gallery for every photo, the first one lit", async () => {
    const view = await renderGallery([photo(1), photo(2), photo(3)]);

    expect(screen.getAllByTestId("listing-gallery-dot")).toHaveLength(2);
    expect(screen.getAllByTestId("listing-gallery-dot-active")).toHaveLength(1);
    expect(screen.getByLabelText("Photo 1 of 3")).toBeTruthy();
    await view.unmount();
  });

  it("lays every photo out as its own full-width page once measured", async () => {
    const view = await renderGallery([photo(1), photo(2, null)]);
    await measure();

    expect(screen.getByLabelText("Sample 1")).toBeTruthy();
    // A photo the shop did not describe is named after the listing.
    expect(screen.getByLabelText("Glossy flyers")).toBeTruthy();
    await view.unmount();
  });

  it("moves the dots as the client swipes", async () => {
    const view = await renderGallery([photo(1), photo(2), photo(3)]);
    await measure();

    await fireEvent.scroll(screen.getByTestId("listing-gallery-list"), {
      nativeEvent: {
        contentOffset: { x: 390, y: 0 },
        contentSize: { width: 1170, height: 300 },
        layoutMeasurement: { width: 390, height: 300 },
      },
    });

    expect(await screen.findByLabelText("Photo 2 of 3")).toBeTruthy();
    await view.unmount();
  });
});
