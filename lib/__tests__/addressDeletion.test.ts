import type { ClientAddress } from "@/lib/api";
import { deleteAddress, setToken } from "@/lib/api";
import { deleteBody, deletedNotice, deleteQuestion, withoutRemoved } from "@/lib/addressDeletion";

const HOME: ClientAddress = {
  id: "addr_home",
  label: "Home",
  addressLine: "12 Quimpo Blvd, Davao City",
  point: { lat: 7.049, lng: 125.588 },
  isDefault: true,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const WORK: ClientAddress = { ...HOME, id: "addr_work", label: "Work", isDefault: false };

describe("DELETE /me/addresses/:id", () => {
  beforeEach(() => setToken("test-session"));
  afterEach(() => {
    setToken(null);
    jest.restoreAllMocks();
  });

  it("deletes by id with no body and reports a cleared default", async () => {
    const fetch = jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ok: true, defaultCleared: true }) } as Response);
    expect(await deleteAddress("addr/1")).toEqual({ defaultCleared: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/me/addresses/addr%2F1"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect((fetch.mock.calls[0][1] as RequestInit).body).toBeUndefined();
  });

  it("reads a missing flag as no default cleared", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ok: true }) } as Response);
    expect(await deleteAddress("addr_work")).toEqual({ defaultCleared: false });
  });
});

describe("what the client is told", () => {
  it("names the address and promises placed orders keep theirs", () => {
    expect(deleteQuestion(WORK)).toBe("Delete Work?");
    expect(deleteBody(WORK)).toContain("Orders you already placed keep the address they were placed with.");
    expect(deleteBody(WORK)).not.toContain("default");
  });

  it("warns before deleting the default that none will be set", () => {
    expect(deleteBody(HOME)).toContain("no default will be set");
  });

  it("says no default is set after the default goes, and that GRIDGO will ask", () => {
    expect(deletedNotice(HOME, true, 1)).toBe(
      "Home deleted. No default address is set now, so GRIDGO will ask where to deliver on your next order.",
    );
    expect(deletedNotice(WORK, false, 1)).toBe("Work deleted.");
    expect(deletedNotice(HOME, true, 0)).toBe("Home deleted. You have no saved addresses now.");
  });

  it("keeps deleted rows off a list GRIDGO has not re-read yet", () => {
    expect(withoutRemoved([HOME, WORK], ["addr_home"])).toEqual([WORK]);
    const list = [HOME];
    expect(withoutRemoved(list, [])).toBe(list);
  });
});
