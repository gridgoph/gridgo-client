import * as api from "@/lib/api";
import { ApiError, type ClientAddress } from "@/lib/api";
import { useAddressDeletion } from "@/store/addressDeletion";
import { useJobFulfilment } from "@/store/jobFulfilment";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deleteAddress: jest.fn() };
});

const deleteAddress = api.deleteAddress as jest.MockedFunction<typeof api.deleteAddress>;

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
const WORK: ClientAddress = { ...HOME, id: "addr_work", label: "Work", isDefault: false, point: { lat: 7.07, lng: 125.61 } };

const initial = useAddressDeletion.getState();

beforeEach(() => {
  useAddressDeletion.setState(initial, true);
  deleteAddress.mockReset();
});

describe("deleting a saved address", () => {
  it("asks first and deletes nothing on cancel", () => {
    const store = useAddressDeletion.getState();
    store.ask("saved-places", WORK, [HOME, WORK]);
    expect(useAddressDeletion.getState()).toMatchObject({ phase: "confirming", target: WORK, owner: "saved-places" });
    useAddressDeletion.getState().cancel();
    expect(useAddressDeletion.getState()).toMatchObject({ phase: "idle", target: null });
    expect(deleteAddress).not.toHaveBeenCalled();
  });

  it("deletes once confirmed and takes the row off the list", async () => {
    deleteAddress.mockResolvedValue({ defaultCleared: false });
    useAddressDeletion.getState().ask("saved-places", WORK, [HOME, WORK]);
    await useAddressDeletion.getState().confirm();
    expect(deleteAddress).toHaveBeenCalledWith("addr_work");
    expect(useAddressDeletion.getState()).toMatchObject({
      phase: "idle",
      removed: ["addr_work"],
      notice: "Work deleted.",
      version: 1,
    });
  });

  it("deleting the default says no default is set and GRIDGO will ask", async () => {
    deleteAddress.mockResolvedValue({ defaultCleared: true });
    useAddressDeletion.getState().ask("where", HOME, [HOME, WORK]);
    await useAddressDeletion.getState().confirm();
    expect(useAddressDeletion.getState().notice).toBe(
      "Home deleted. No default address is set now, so GRIDGO will ask where to deliver on your next order.",
    );
  });

  it("leaves a job's own copy of the address alone, as a placed order keeps its own", async () => {
    // The job (and the order it becomes) holds a copy of the drop-off, not the saved row.
    const dropoff = { ...HOME.point, label: HOME.addressLine };
    useJobFulfilment.getState().set({ fulfillmentMode: "delivery", dropoff });
    deleteAddress.mockResolvedValue({ defaultCleared: true });
    useAddressDeletion.getState().ask("fulfilment", HOME, [HOME]);
    await useAddressDeletion.getState().confirm();
    expect(useJobFulfilment.getState().choice).toEqual({ fulfillmentMode: "delivery", dropoff });
  });

  it("treats an address already gone as deleted and says so plainly", async () => {
    deleteAddress.mockRejectedValue(
      new ApiError(404, { error: "address_not_found", message: "That saved address no longer exists." }),
    );
    useAddressDeletion.getState().ask("saved-places", WORK, [HOME, WORK]);
    await useAddressDeletion.getState().confirm();
    expect(useAddressDeletion.getState()).toMatchObject({
      phase: "idle",
      removed: ["addr_work"],
      notice: "That address is no longer saved. Your list has been refreshed.",
    });
  });

  it("keeps the question open with the reason when the delete fails", async () => {
    deleteAddress.mockRejectedValue(new ApiError(500, { error: "internal" }));
    useAddressDeletion.getState().ask("saved-places", WORK, [HOME, WORK]);
    await useAddressDeletion.getState().confirm();
    expect(useAddressDeletion.getState()).toMatchObject({
      phase: "confirming",
      removed: [],
      error: "The server had a problem. Wait a moment, then try again.",
    });
  });

  it("clears only the notice belonging to the screen that leaves", async () => {
    deleteAddress.mockResolvedValue({ defaultCleared: false });
    useAddressDeletion.getState().ask("fulfilment", WORK, [HOME, WORK]);
    await useAddressDeletion.getState().confirm();
    useAddressDeletion.getState().clearNotice("where");
    expect(useAddressDeletion.getState().notice).toBe("Work deleted.");
    useAddressDeletion.getState().clearNotice("fulfilment");
    expect(useAddressDeletion.getState().notice).toBeNull();
  });
});
