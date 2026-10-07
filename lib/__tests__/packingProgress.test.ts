import {
  packingPhotos,
  withPackingUpdates,
  PACKED_UPDATE,
} from "@/lib/packingProgress";
import { pushTargetRoute } from "@/lib/push";
it("shows no invented packed update for old, empty or missing evidence", () => {
  expect(packingPhotos({})).toEqual([]);
  expect(
    packingPhotos({
      packingProgress: { status: "waiting_for_photo", photos: [] },
    }),
  ).toEqual([]);
  expect(withPackingUpdates([], [])).toEqual([]);
});
it("keeps packing as its own dated update between production and dispatch", () => {
  const rows = [
    {
      key: "print",
      at: "2026-10-07T01:00:00Z",
      state: "production",
      title: "In production",
      actor: null,
    },
    {
      key: "dispatch",
      at: "2026-10-07T03:00:00Z",
      state: "ready_for_dispatch",
      title: "Ready for dispatch",
      actor: null,
    },
  ];
  const photos = packingPhotos({
    packingProgress: {
      status: "photos_available",
      photos: [
        {
          fileId: "packed",
          contentType: "image/jpeg",
          at: "2026-10-07T02:00:00Z",
        },
      ],
    },
  });
  expect(withPackingUpdates(rows, photos).map((r) => r.key)).toEqual([
    "print",
    "packing:packed",
    "dispatch",
  ]);
  expect(withPackingUpdates([], photos)[0].title).toBe(PACKED_UPDATE);
  expect(
    pushTargetRoute({
      type: "order_packed",
      orderId: "job",
      notificationId: "notice",
      at: null,
    }),
  ).toBe("/order/job");
});
