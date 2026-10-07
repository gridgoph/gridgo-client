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

// Swiping is not an accessible gesture, so the position is an adjustable
// control a screen reader can step through.
it("steps to the next photo from the screen reader's adjust action", async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListingGallery photos={[photo(1), photo(2), photo(3)]} name="Glossy flyers" />
    </SafeAreaProvider>,
  );

  await fireEvent(screen.getByLabelText("Photo 1 of 3"), "accessibilityAction", {
    nativeEvent: { actionName: "increment" },
  });

  expect(await screen.findByLabelText("Photo 2 of 3")).toBeTruthy();
  await view.unmount();
});
