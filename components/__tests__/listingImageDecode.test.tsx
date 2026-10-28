import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ListingGallery } from "@/components/ListingGallery";
import { SamplePhoto } from "@/components/SamplePhoto";
import type { CatalogPhoto } from "@/lib/api";

/**
 * Android decodes a remote photo at full size unless the Image asks to be
 * resized to the box it is drawn in, and the listing's thumb strip mounts
 * every sample at once. A plausible (unconfirmed) cause of the reported crash
 * at the specs step on a low-memory phone; every sample image on the order
 * path asks for the resize.
 */

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

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

function images(tree: Node | Node[] | null): Node[] {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap(images);
  const own = tree.type === "Image" ? [tree] : [];
  return [...own, ...(tree.children ?? []).flatMap((child) => (typeof child === "string" ? [] : images(child)))];
}

it("resizes every gallery photo and thumbnail to the size it is drawn", async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ListingGallery photos={[photo(1), photo(2), photo(3), photo(4)]} name="Glossy flyers" />
    </SafeAreaProvider>,
  );
  const drawn = images(view.toJSON() as Node | Node[] | null);
  expect(drawn.length).toBeGreaterThanOrEqual(5);
  for (const image of drawn) expect(image.props.resizeMethod).toBe("resize");
});

it("resizes a sample drawn on its own", async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SamplePhoto url="https://cdn.example/sample-1.jpg" altText="Sample 1" interactive={false} />
    </SafeAreaProvider>,
  );
  const drawn = images(view.toJSON() as Node | Node[] | null);
  expect(drawn).toHaveLength(1);
  expect(drawn[0].props.resizeMethod).toBe("resize");
});
