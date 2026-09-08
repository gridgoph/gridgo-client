import { getOrder } from "@/lib/api";
import { setLiveOwner } from "@/lib/live";
it("rejects an old account response before it can update a mounted store", async () => {
  let resolve!: (response: Response) => void;
  global.fetch = jest.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  ) as typeof fetch;
  setLiveOwner("old");
  const pending = getOrder("order-a");
  await Promise.resolve();
  await Promise.resolve();
  setLiveOwner("new");
  resolve({
    ok: true,
    text: async () => JSON.stringify({ order: { id: "order-a" } }),
  } as Response);
  await expect(pending).rejects.toThrow("account changed");
});
