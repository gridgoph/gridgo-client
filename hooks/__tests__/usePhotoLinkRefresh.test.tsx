import { act, renderHook } from "@testing-library/react-native";

import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import type { CatalogItem } from "@/lib/api";

type Listing = Pick<CatalogItem, "photos">;

function listing(expiresAt: string): Listing {
  return {
    photos: [
      {
        fileId: "file_1",
        sortOrder: 0,
        altText: null,
        url: "/catalog/media/file_1",
        downloadUrl: "https://storage.example/file_1",
        downloadUrlExpiresAt: expiresAt,
      },
    ],
  };
}

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe("usePhotoLinkRefresh", () => {
  it("shares one re-read between every tile that asks at once", async () => {
    let finish: () => void = () => undefined;
    const reread = jest.fn(
      () =>
        new Promise<Listing[]>((resolve) => {
          finish = () => resolve([listing(minutesFromNow(5))]);
        }),
    );
    const held = [listing(minutesFromNow(-1))];
    const { result, unmount } = await renderHook(() => usePhotoLinkRefresh(held, reread));

    let asks: Promise<void>[] = [];
    await act(async () => {
      asks = [result.current(), result.current(), result.current()];
      await Promise.resolve();
    });
    expect(reread).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      await Promise.all(asks);
    });
    await unmount();
  });

  it("stops re-reading on expiry when fresh links arrive already expired (clock ahead)", async () => {
    // A phone whose clock runs ten minutes fast sees every new link as dead.
    const reread = jest.fn(async () => [listing(minutesFromNow(-5))]);
    const held = [listing(minutesFromNow(-5))];
    const { result, unmount } = await renderHook(() => usePhotoLinkRefresh(held, reread));

    await act(async () => {
      await result.current();
    });
    await act(async () => {
      await result.current();
    });

    expect(reread).toHaveBeenCalledTimes(1);
    await unmount();
  });
});
