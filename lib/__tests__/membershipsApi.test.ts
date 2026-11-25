import { checkoutCart, checkoutExpress, checkoutExpressGroup } from "@/lib/api";
import {
  confirmMembershipMatch,
  dismissMembershipMatch,
  endMembership,
  listMemberships,
  matchMemberships,
  previewMembershipInvite,
  requestMembership,
} from "@/lib/membershipsApi";
import { JOIN_TOKEN, membership, membershipInvite } from "@/test/membershipFixtures";

let sent: { path: string; method: string; body: unknown }[] = [];

function answer(body: unknown) {
  sent = [];
  jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    sent.push({
      path: String(input).replace(/^https?:\/\/[^/]+/, ""),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
}

afterEach(() => jest.restoreAllMocks());

it("reads, matches, confirms, dismisses, previews, asks and ends on the documented routes", async () => {
  answer({ membership: membership(), invite: membershipInvite(), memberships: [], matches: [] });
  await listMemberships();
  await matchMemberships();
  await confirmMembershipMatch("mle_1");
  await dismissMembershipMatch("mle_1");
  await previewMembershipInvite(JOIN_TOKEN);
  await requestMembership(JOIN_TOKEN, "qr");
  await endMembership("mem_1");
  expect(sent).toEqual([
    { path: "/me/memberships", method: "GET", body: undefined },
    { path: "/me/memberships/matches", method: "POST", body: {} },
    { path: "/me/memberships/matches/mle_1/confirm", method: "POST", body: {} },
    { path: "/me/memberships/matches/mle_1/dismiss", method: "POST", body: {} },
    { path: "/me/memberships/preview", method: "POST", body: { token: JOIN_TOKEN } },
    { path: "/me/memberships", method: "POST", body: { token: JOIN_TOKEN, source: "qr" } },
    { path: "/me/memberships/mem_1", method: "DELETE", body: undefined },
  ]);
});

it("carries the perk on screen to every checkout, and nothing when the quote had none", async () => {
  answer({});
  const express = { confirmation: "conf", payment: { method: "cash" as const }, artworkRights: null };
  await checkoutCart("cart_1", { method: "cash" }, null, null, 400);
  await checkoutCart("cart_1", { method: "cash" }, null, null, 0);
  await checkoutCart("cart_1", { method: "cash" });
  await checkoutExpress("cart_2", { ...express, expectedMemberPerkMinor: 400 });
  await checkoutExpress("cart_2", express);
  await checkoutExpressGroup("grp_1", { ...express, expectedMemberPerkMinor: 400 });
  const expected = sent.map((call) => (call.body as { expectedMemberPerkMinor?: number }).expectedMemberPerkMinor);
  expect(expected).toEqual([400, 0, undefined, 400, undefined, 400]);
});
