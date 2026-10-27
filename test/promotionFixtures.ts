import type { PromotionInvite, PromotionOffer, Promotions } from "@/lib/api";
import { voucher } from "@/test/voucherFixtures";

/** Shared set-up for the launch promotion tests (gridgo-api#315), split one press per file. */

/** Sun 8 Nov 2026, 11:59:59 PM in Davao. */
export const ENDS_AT = "2026-11-08T15:59:59.000Z";

/** `GET /me/promotions` for a client who can still claim the Founding 30. */
export function promotions(overrides: {
  founding?: Partial<Promotions["founding"]>;
  friendPass?: Partial<Promotions["friendPass"]>;
  rewards?: Promotions["rewards"];
} = {}): Promotions {
  return {
    serverTime: new Date().toISOString(),
    rewards: overrides.rewards ?? { surveyMinor: 1500, missionMinor: 1500, inviteMinor: 1500 },
    founding: { claimable: true, amountMinor: 20000, slotsLeft: 12, endsAt: ENDS_AT, voucher: null, ...overrides.founding },
    friendPass: { canInvite: false, invite: null, invites: [], offer: null, voucher: null, ...overrides.friendPass },
  };
}

export const foundingVoucher = voucher({
  id: "vch_founding",
  campaignId: "launch_founding_v1",
  name: "Founding 30",
  valueMinor: 20000,
  expiresAt: ENDS_AT,
  promotionKind: "founding",
  coversOrderTotal: true,
  upgradedAt: null,
});

export const friendPassVoucher = voucher({
  id: "vch_friend",
  campaignId: "launch_friend_pass_v1",
  name: "Friend Pass",
  valueMinor: 10000,
  expiresAt: ENDS_AT,
  promotionKind: "friend_pass",
  coversOrderTotal: true,
  upgradedAt: null,
});

export function invite(overrides: Partial<PromotionInvite> = {}): PromotionInvite {
  return {
    id: "pinv_1",
    founder: { id: "u_founder", name: "Ven", email: "ven@example.com" },
    email: "ana@example.com",
    friendEmail: "ana@example.com",
    clientId: null,
    status: "invited",
    createdAt: "2026-10-27T02:00:00.000Z",
    claimedAt: null,
    valueMinor: null,
    upgradedAt: null,
    ...overrides,
  };
}

export const friendOffer: PromotionOffer = { ...invite({ clientId: "u1" }), amountMinor: 10000, endsAt: ENDS_AT };

