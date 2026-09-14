import * as api from "@/lib/api";

function response(name: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ productCategories: [{
      code: "print", name, subcategories: [{ code: "flyers", name: "Flyers" }],
    }] }),
  } as Response;
}

beforeEach(() => {
  api.setToken(null);
  api.setTokenProvider(null);
  api.clearProductCategoryCache();
});
afterEach(() => jest.restoreAllMocks());

it("requests a fresh tree after clearing a cached tree", async () => {
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue(response("Old"));
  expect((await api.getProductCategories())[0].name).toBe("Old");
  api.clearProductCategoryCache();
  fetch.mockResolvedValue(response("New"));
  expect((await api.getProductCategories())[0].name).toBe("New");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([false, true])("invalidates a pending tree and its fallback: %s", async (fails) => {
  let finish!: (value: Response) => void;
  let fail!: (error: Error) => void;
  const fetch = jest.spyOn(global, "fetch")
    .mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }))
    .mockResolvedValue(response("New"));
  const old = api.getProductCategories();
  while (!finish) await Promise.resolve();
  api.clearProductCategoryCache();
  const fresh = await api.getProductCategories();
  if (fails) fail(new Error("Old request failed"));
  else finish(response("Old"));
  expect(await old).toEqual(fresh);
  expect(api.productCategoriesNow()[0].name).toBe("New");
  expect(await api.getProductCategories()).toEqual(fresh);
  expect(fetch).toHaveBeenCalledTimes(2);
});
