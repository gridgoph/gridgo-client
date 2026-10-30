import { CATALOG_SHOP_PAGE_CAP, listCatalogShops } from "@/lib/api";

/**
 * The directory is paged, and the client stops at a page cap. A read stopped
 * there with a cursor still outstanding is not the whole directory: a product
 * listed only past the cap would otherwise be called off press.
 */
describe("listCatalogShops", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** `pages` pages of two shops each; every page but the last has a cursor. */
  function pagedDirectory(pages: number) {
    let served = 0;
    global.fetch = jest.fn(async () => {
      const page = served;
      served += 1;
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            shops: [{ supplierId: `shop_${page}_a` }, { supplierId: `shop_${page}_b` }],
            nextCursor: page + 1 < pages ? `cursor_${page + 1}` : null,
          }),
      };
    }) as unknown as typeof fetch;
    return { served: () => served };
  }

  it("calls a directory read to its last page complete", async () => {
    const reads = pagedDirectory(3);
    const directory = await listCatalogShops("marketing_collateral");

    expect(reads.served()).toBe(3);
    expect(directory.shops).toHaveLength(6);
    expect(directory.complete).toBe(true);
  });

  it("calls a directory complete when its last page lands exactly on the cap", async () => {
    pagedDirectory(CATALOG_SHOP_PAGE_CAP);
    const directory = await listCatalogShops("marketing_collateral");

    expect(directory.complete).toBe(true);
  });

  it("calls a directory cut off at the cap, cursor outstanding, incomplete", async () => {
    const reads = pagedDirectory(CATALOG_SHOP_PAGE_CAP + 1);
    const directory = await listCatalogShops("marketing_collateral");

    expect(reads.served()).toBe(CATALOG_SHOP_PAGE_CAP);
    expect(directory.shops).toHaveLength(CATALOG_SHOP_PAGE_CAP * 2);
    expect(directory.complete).toBe(false);
  });
});
