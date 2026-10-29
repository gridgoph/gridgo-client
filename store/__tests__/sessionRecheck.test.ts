import * as api from "@/lib/api";
import { useListingDraft, type ListingDraft } from "@/store/listingDraft";
import { resetSessionRecheck, useSession } from "@/store/session";

// A transient refusal from gridgo-api is not a sign-out (#338). A Clerk
// session keeps its client, and the client keeps their place, while GRIDGO is
// asked again in the background.

const client: api.User = {
  id: "u1",
  email: "ana@company.com",
  name: "Ana",
  role: "client",
  accountType: "individual",
};

type Reply = { status: number; body: unknown } | Error;

function reply(status: number, body: unknown = {}): Reply {
  return { status, body };
}

/** Every `/auth/me` answers with `me`; every other path with `other`. */
function serve(other: Reply, me: Reply) {
  return jest.spyOn(global, "fetch").mockImplementation(async (input) => {
    const answer = String(input).endsWith("/auth/me") ? me : other;
    if (answer instanceof Error) throw answer;
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      text: async () => JSON.stringify(answer.body),
    } as Response;
  });
}

function meCalls(fetchMock: jest.SpyInstance): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/auth/me")).length;
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

beforeEach(() => {
  resetSessionRecheck();
  api.setToken(null);
  api.setTokenProvider(async () => "clerk-jwt");
  useSession.setState({ signingOut: false, error: null, clerkSyncNonce: 0 });
  useSession.getState().adoptClerkUser(client);
  useListingDraft.getState().keep("item_1", { quantity: 100 } as unknown as ListingDraft);
});

afterEach(() => {
  jest.restoreAllMocks();
  api.setTokenProvider(null);
  useSession.setState({ user: null, source: null });
});

it("keeps the client and the listing in progress when gridgo-api refuses a fresh token", async () => {
  const fetchMock = serve(reply(401, { error: "unauthorized" }), reply(200, { user: client }));

  await expect(api.getOrder("order_1")).rejects.toMatchObject({ status: 401 });
  await settle();

  expect(useSession.getState().user?.id).toBe("u1");
  expect(useSession.getState().source).toBe("clerk");
  expect(useListingDraft.getState().drafts.item_1).toBeDefined();
  // Re-checked once, quietly, with no new join.
  expect(meCalls(fetchMock)).toBe(1);
  expect(useSession.getState().clerkSyncNonce).toBe(0);
  expect(useSession.getState().sessionWait).toBeNull();
});

it("keeps the client when the re-check itself cannot reach GRIDGO", async () => {
  serve(reply(401, { error: "unauthorized" }), new TypeError("Network request failed"));

  await expect(api.getOrder("order_1")).rejects.toMatchObject({ status: 401 });
  await settle();

  expect(useSession.getState().user?.id).toBe("u1");
  expect(useSession.getState().error).toBeNull();
});

it("keeps the client when the re-check is refused as well", async () => {
  serve(reply(401, { error: "unauthorized" }), reply(401, { error: "unauthorized" }));

  await expect(api.getOrder("order_1")).rejects.toMatchObject({ status: 401 });
  await settle();

  expect(useSession.getState().user?.id).toBe("u1");
});

it("asks once for a burst of refusals", async () => {
  const fetchMock = serve(reply(401, { error: "unauthorized" }), reply(200, { user: client }));

  await Promise.allSettled([api.getOrder("a"), api.getOrder("b"), api.getOrder("c")]);
  await settle();
  await expect(api.getOrder("d")).rejects.toMatchObject({ status: 401 });
  await settle();

  expect(meCalls(fetchMock)).toBe(1);
  expect(useSession.getState().user?.id).toBe("u1");
});

it("ends the session when GRIDGO confirms this is no longer a client", async () => {
  serve(
    reply(401, { error: "unauthorized" }),
    reply(200, { user: { ...client, role: "supplier" } }),
  );

  await expect(api.getOrder("order_1")).rejects.toMatchObject({ status: 401 });
  await settle();

  expect(useSession.getState().user).toBeNull();
});

it("ends the session on a 403 that is not an account hold", async () => {
  serve(reply(401, { error: "unauthorized" }), reply(403, { error: "forbidden", role: "rider" }));

  await expect(api.getOrder("order_1")).rejects.toMatchObject({ status: 401 });
  await settle();

  expect(useSession.getState().user).toBeNull();
});
