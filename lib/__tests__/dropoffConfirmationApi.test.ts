import { answerDropoffConfirmation, setToken } from "@/lib/api";

beforeEach(() => { setToken("test-session"); });
afterEach(() => { setToken(null); jest.restoreAllMocks(); });

it.each([
  { action: "confirm" as const },
  { action: "change" as const, point: { lat: 7.07, lng: 125.61, label: "Meeting point" } },
])("sends the owning-client answer through the shared API: %j", async (answer) => {
  const confirmation = { status: "confirmed", point: { lat: 7.07, lng: 125.61, label: "Meeting point" } };
  const fetch = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, text: async () => JSON.stringify({ confirmation }) } as Response);
  expect(await answerDropoffConfirmation("order/1", answer)).toEqual(confirmation);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/orders/order%2F1/dropoff-confirmation"), expect.objectContaining({
    method: "POST", body: JSON.stringify(answer),
    headers: expect.objectContaining({ Authorization: "Bearer test-session", "X-GRIDGO-Role": "client" }),
  }));
});
