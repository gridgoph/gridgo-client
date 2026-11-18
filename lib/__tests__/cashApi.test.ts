import { checkoutCart, getOrderCash, setToken, setTokenProvider, submitCashRepayment } from "@/lib/api";

afterEach(() => { jest.restoreAllMocks(); setToken(null); setTokenProvider(null); });
function fetchResult(body: unknown) {
  setTokenProvider(async () => "client-session");
  return jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(body) } as Response);
}
it("retains the exact online checkout payload and sends only cash method for cash", async () => {
  const fetch = fetchResult({});
  await checkoutCart("cart/1", { reference: "ref", proofFileId: "proof" });
  expect(fetch.mock.calls[0][1]?.body).toBe(JSON.stringify({ payment: { method: "qr_manual", reference: "ref", proofFileId: "proof" } }));
  await checkoutCart("cart/1", { method: "cash" });
  expect(fetch.mock.calls[1][1]?.body).toBe(JSON.stringify({ payment: { method: "cash" } }));
  await checkoutCart("cart/1", null);
  expect(fetch.mock.calls[2][1]?.body).toBe("{}");
});
it("reads only client cash detail and submits exact repayment with version and idempotency key", async () => {
  const cash = { version: 4, status: "cash_debt", repayment: { status: "pending", submittedAt: "2026-11-18T10:00:00Z", rejectedAt: null, rejectionReason: null } };
  const fetch = fetchResult({ cash });
  expect(await getOrderCash("order/1")).toEqual(cash);
  expect(fetch.mock.calls[0][0]).toMatch(/\/orders\/order%2F1\/cash$/);
  const body = { expectedVersion: 3, amountMinor: 6900, reference: "1234567890123", proofFileId: "proof" };
  expect(await submitCashRepayment("order/1", body, "retry-key")).toEqual(cash);
  expect(fetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": "retry-key" }), body: JSON.stringify(body) }));
});
