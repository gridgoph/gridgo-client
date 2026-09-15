import { setToken, setTokenProvider, submitPayment } from "@/lib/api";
afterEach(() => { jest.restoreAllMocks(); setToken(null); setTokenProvider(null); });
it("sends the uploaded receipt ID with the reference and preserves pending confirmation", async () => {
  setTokenProvider(async () => "client-session");
  const order = { id: "job", payments: { final_online: { status: "pending_confirmation" } } };
  const request = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ order }) } as Response);
  expect(await submitPayment("job", "balance", "1234567890123", "receipt")).toEqual(order);
  expect(request).toHaveBeenCalledWith(expect.stringMatching(/\/orders\/job\/payments\/balance\/submit$/), expect.objectContaining({ body: JSON.stringify({ method: "qr_manual", reference: "1234567890123", proofFileId: "receipt" }) }));
});
