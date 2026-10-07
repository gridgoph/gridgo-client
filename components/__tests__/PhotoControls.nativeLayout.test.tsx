import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ListingGallery } from "@/components/ListingGallery";
import { SamplePhotoViewer } from "@/components/SamplePhotoViewer";
import type { CatalogPhoto } from "@/lib/api";

// On a phone NativeWind draws `className` through react-native-css, which
// drops a Pressable's style *function* outright: the thumbnails came out zero
// wide and Next/Previous stacked in the top-left corner, while web drew both.
// Jest normally skips that layer, so here the components' Pressable goes
// through it, the way it does on a phone.
jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  let CssPressable: ((props: object) => unknown) | undefined;
  return new Proxy(actual, {
    get(target, key) {
      if (key !== "Pressable") return target[key];
      if (!CssPressable) {
        const { useCssElement } = jest.requireActual("react-native-css");
        CssPressable = function CssPressable(props: object) {
          return useCssElement(actual.Pressable, props, { className: "style" });
        };
      }
      return CssPressable;
    },
  });
});

// Required rather than imported: its typed source is not this app's to check.
const { registerCSS } = jest.requireActual<{ registerCSS: (css: string) => void }>(
  "react-native-css/jest",
);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
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

const viewerPhotos = [
  { uri: "https://cdn.example/a.jpg", alt: "Front" },
  { uri: "https://cdn.example/b.jpg", alt: "Back" },
  { uri: "https://cdn.example/c.jpg", alt: "Edge" },
];

const hidden = { includeHiddenElements: true };

beforeEach(() => {
  registerCSS(`
    .absolute { position: absolute; }
    .overflow-hidden { overflow: hidden; }
    .border-2 { border-width: 2px; }
  `);
});

it("sizes every listing thumbnail 56 by 56", async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListingGallery photos={[photo(1), photo(2), photo(3)]} name="Glossy flyers" />
    </SafeAreaProvider>,
  );

  for (const i of [0, 1, 2]) {
    expect(screen.getByTestId(`listing-gallery-thumb-${i}`, hidden)).toHaveStyle({
      overflow: "hidden",
      width: 56,
      height: 56,
    });
  }
  await view.unmount();
});

it("sizes the viewer's thumbnails and puts Next and Previous on the photo's edges", async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SamplePhotoViewer photos={viewerPhotos} index={1} open onClose={() => {}} />
    </SafeAreaProvider>,
  );

  expect(screen.getByTestId("sample-photo-thumb-0", hidden)).toHaveStyle({ width: 56, height: 56 });
  for (const [direction, edge] of [
    ["previous", "left"],
    ["next", "right"],
  ] as const) {
    expect(screen.getByTestId(`sample-photo-${direction}`, hidden)).toHaveStyle({
      position: "absolute",
      top: "50%",
      marginTop: -22,
      [edge]: 12,
      width: 44,
      height: 44,
    });
  }
  await view.unmount();
});
