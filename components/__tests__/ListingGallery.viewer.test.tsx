import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ListingGallery } from "@/components/ListingGallery";
import type { CatalogPhoto } from "@/lib/api";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function photo(n: number): CatalogPhoto {
  return {
    fileId: `file_${n}`,
    sortOrder: n,
    altText: `Sample ${n}`,
    url: `/catalog/media/file_${n}`,
    downloadUrl: `https://cdn.example/sample-${n}.jpg`,
    downloadUrlExpiresAt: "2999-01-01T00:00:00.000Z",
  };
}

it("opens the full-screen viewer on the photo that was tapped, with every photo behind it", async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListingGallery photos={[photo(1), photo(2), photo(3)]} name="Glossy flyers" />
    </SafeAreaProvider>,
  );
  await fireEvent(screen.getByTestId("listing-gallery-pager"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 300 } },
  });

  await fireEvent.press(screen.getByLabelText("Open Sample 2 larger"));

  expect(await screen.findByTestId("sample-photo-viewer")).toBeTruthy();
  expect(screen.getByText("2 / 3")).toBeTruthy();
  expect(screen.getByTestId("sample-photo-viewer-image").props.source).toEqual({
    uri: "https://cdn.example/sample-2.jpg",
  });
  await view.unmount();
});
