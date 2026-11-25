import * as appApi from "@/lib/api";
import { saveSignedInFile } from "@/lib/fileSave";
import * as events from "@/lib/organizationMembersApi";
import { packFileName, useOrganizationEvents } from "@/store/organizationEvents";
import { useSession } from "@/store/session";
import { EVENT, ORG_USER, PARTNERSHIP } from "@/test/organizationMembers";

jest.mock("@/lib/organizationMembersApi");
jest.mock("@/lib/fileSave", () => ({ ...jest.requireActual("@/lib/fileSave"), saveSignedInFile: jest.fn() }));

const api = jest.mocked(events);
const save = jest.mocked(saveSignedInFile);
const store = () => useOrganizationEvents.getState();
const refused = (status: number, body: object) => new appApi.ApiError(status, body);

beforeEach(() => {
  Object.values(api).forEach((fn) => jest.isMockFunction(fn) && fn.mockReset());
  save.mockReset();
  useSession.setState({ user: ORG_USER, source: "clerk", loading: false, error: null, signingOut: false });
  store().reset();
  api.listOrganizationEvents.mockResolvedValue(PARTNERSHIP.events);
  api.getPartnership.mockResolvedValue(PARTNERSHIP);
});

it("creates an event with its orders", async () => {
  store().startForm(null);
  store().setName("  Sample Week ");
  store().togglePicked("ord_1");
  api.createOrganizationEvent.mockResolvedValue(EVENT);
  expect(await store().save()).toBe("ev_1");
  expect(api.createOrganizationEvent).toHaveBeenCalledWith("Sample Week", ["ord_1"]);
});

it("edits with the version it read", async () => {
  store().startForm(EVENT);
  store().togglePicked("ord_3ff0128e105b");
  api.updateOrganizationEvent.mockResolvedValue(EVENT);
  await store().save();
  expect(api.updateOrganizationEvent).toHaveBeenCalledWith("ev_1", {
    expectedVersion: 2,
    name: "Sample Week",
    orderIds: ["ord_3ff0128e105a"],
  });
});

it("unticks an order that is already in another event", async () => {
  store().startForm(null);
  store().setName("Sports Day");
  store().togglePicked("ord_1");
  store().togglePicked("ord_2");
  api.createOrganizationEvent.mockRejectedValue(refused(409, { error: "event_order_already_recorded", orderIds: ["ord_1"] }));
  expect(await store().save()).toBeNull();
  expect(store()).toMatchObject({ picked: ["ord_2"], taken: ["ord_1"] });
  expect(store().saveError).toMatch(/already in another event/);
});

it("offers only orders an event can hold", async () => {
  jest.spyOn(appApi, "listOrders").mockResolvedValue([
    { id: "a", state: "completed" },
    { id: "b", state: "cancelled" },
    { id: "c", state: "draft" },
  ] as unknown as appApi.Order[]);
  await store().loadOrders();
  expect(store().orders.map((order) => order.id)).toEqual(["a"]);
});

it("deletes the grouping", async () => {
  useOrganizationEvents.setState({ event: EVENT, list: PARTNERSHIP.events });
  api.deleteOrganizationEvent.mockResolvedValue(undefined);
  expect(await store().remove()).toBe(true);
  expect(api.deleteOrganizationEvent).toHaveBeenCalledWith("ev_1", 2);
  expect(store().event).toBeNull();
});

it("says what came of a pack, and never claims a file it did not get", async () => {
  api.eventPackRequest.mockResolvedValue({ url: "https://api.example/pack", headers: {} });
  save.mockResolvedValueOnce({ kind: "saved", message: "Downloaded sample-week-statement.pdf." });
  await store().pack(EVENT, "pdf");
  expect(save).toHaveBeenCalledWith({ url: "https://api.example/pack", headers: {} }, "sample-week-statement.pdf", "application/pdf");
  expect(store().packNotice).toEqual({ id: "ev_1", tone: "success", message: "Downloaded sample-week-statement.pdf." });
  save.mockResolvedValueOnce({ kind: "refused", status: 500, body: "" });
  await store().pack(EVENT, "csv");
  expect(store().packNotice?.tone).toBe("error");
  save.mockRejectedValueOnce(new Error("offline"));
  await store().pack(EVENT, "csv");
  expect(store().packNotice?.message).toMatch(/Check your connection/);
  expect(store().packing).toBeNull();
});

it("names the file for the event", () => {
  expect(packFileName("Sample Week 2026!", "csv")).toBe("sample-week-2026-statement.csv");
  expect(packFileName("節", "pdf")).toBe("event-statement.pdf");
});
