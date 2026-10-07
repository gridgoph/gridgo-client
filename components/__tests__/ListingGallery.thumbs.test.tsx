import { fireEvent, render, screen } from "@testing-library/react-native";
import { FlatList } from "react-native";
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

it("jumps the gallery to the photo whose thumbnail was tapped", async () => {
  const scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset");
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListingGallery photos={[photo(1), photo(2), photo(3), photo(4)]} name="Glossy flyers" />
    </SafeAreaProvider>,
  );
  await fireEvent(screen.getByTestId("listing-gallery-pager"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 300 } },
  });

  await fireEvent.press(screen.getByTestId("listing-gallery-thumb-2"));

  expect(await screen.findByLabelText("Photo 3 of 4")).toBeTruthy();
  expect(screen.getByTestId("listing-gallery-thumb-2")).toBeSelected();
  expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 780, animated: true });
  scrollToOffset.mockRestore();
  await view.unmount();
});
