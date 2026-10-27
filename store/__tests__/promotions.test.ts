import type { Promotions } from "@/lib/api";
import { usePromotions } from "@/store/promotions";
import { foundingVoucher, invite, promotions } from "@/test/promotionFixtures";

/**
 * Reads and claims racing each other. A `GET /me/promotions` that left before
 * a claim still says "claimable"; landing after the claim it would put the
 * Redeem card back for someone who already holds the voucher.
 */

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getPromotions: jest.fn(),
    claimFoundingVoucher: jest.fn(),
    inviteFriendPass: jest.fn(),
    listVouchers: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const open = promotions();
const claimed = promotions({ founding: { claimable: false, voucher: foundingVoucher } });
const founder = promotions({ founding: { claimable: false, voucher: foundingVoucher }, friendPass: { canInvite: true } });
const sent = invite();
const invited = promotions({
  founding: { claimable: false, voucher: foundingVoucher },
  friendPass: { canInvite: false, invite: sent, invites: [sent] },
});

beforeEach(() => {
  usePromotions.getState().reset();
  api.listVouchers.mockReturnValue(new Promise(() => undefined));
});

it("drops a read that left before the claim and answered after it", async () => {
  const before = deferred<Promotions>();
  api.getPromotions.mockReturnValueOnce(before.promise);
  api.claimFoundingVoucher.mockResolvedValueOnce(claimed);

  const reading = usePromotions.getState().load();
  await usePromotions.getState().claim("founding");
  before.resolve(open);
  await reading;

  expect(usePromotions.getState().data?.founding.voucher?.id).toBe("vch_founding");
  expect(usePromotions.getState().data?.founding.claimable).toBe(false);
});

it("drops a read that left during the claim and answered after it", async () => {
  const claim = deferred<Promotions>();
  const during = deferred<Promotions>();
  api.claimFoundingVoucher.mockReturnValueOnce(claim.promise);
  api.getPromotions.mockReturnValueOnce(during.promise);

  const claiming = usePromotions.getState().claim("founding");
  const reading = usePromotions.getState().load();
  claim.resolve(claimed);
  await claiming;
  during.resolve(open);
  await reading;

  expect(usePromotions.getState().data?.founding.voucher?.id).toBe("vch_founding");
});

it("drops a read that left before the invite and answered after it", async () => {
  usePromotions.setState({ data: founder });
  const before = deferred<Promotions>();
  api.getPromotions.mockReturnValueOnce(before.promise);
  api.inviteFriendPass.mockResolvedValueOnce(invited);

  const reading = usePromotions.getState().load();
  await usePromotions.getState().invite("ana@example.com");
  before.resolve(founder);
  await reading;

  expect(usePromotions.getState().data?.friendPass.invite?.status).toBe("invited");
});

it("keeps only the newest of two reads, whichever answers last", async () => {
  const first = deferred<Promotions>();
  const second = deferred<Promotions>();
  api.getPromotions.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

  const a = usePromotions.getState().load();
  const b = usePromotions.getState().load();
  second.resolve(promotions({ founding: { slotsLeft: 3 } }));
  await b;
  first.resolve(promotions({ founding: { slotsLeft: 12 } }));
  await a;

  expect(usePromotions.getState().data?.founding.slotsLeft).toBe(3);
  expect(usePromotions.getState().loading).toBe(false);
});

it("still lands the read a refused claim asks for", async () => {
  usePromotions.setState({ data: open });
  api.claimFoundingVoucher.mockRejectedValueOnce(new (jest.requireActual("@/lib/api").ApiError)(409, { error: "promotion_sold_out" }));
  api.getPromotions.mockResolvedValueOnce(promotions({ founding: { claimable: false, slotsLeft: 0 } }));

  await usePromotions.getState().claim("founding");
  await new Promise((done) => setTimeout(done, 0));

  expect(usePromotions.getState().data?.founding.slotsLeft).toBe(0);
  expect(usePromotions.getState().claimNotice).toEqual({ ok: false, text: "Every Founding voucher has been claimed." });
});

it("drops anything started for the last account", async () => {
  const before = deferred<Promotions>();
  api.getPromotions.mockReturnValueOnce(before.promise);

  const reading = usePromotions.getState().load();
  usePromotions.getState().reset();
  before.resolve(open);
  await reading;

  expect(usePromotions.getState().data).toBeNull();
});
