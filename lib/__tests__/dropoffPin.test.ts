import {
  FINDING_YOU,
  OUTSIDE_TITLE,
  PIN_EMPTY_TITLE,
  STREET_UNNAMED_TITLE,
  pinStatus,
  type PinStatusInput,
} from "@/lib/dropoffPin";
import { OUTSIDE_DAVAO, READING_PLACE } from "@/lib/geocode";

const BASE: PinStatusInput = {
  hasPoint: true,
  locating: false,
  reversing: false,
  outside: false,
  streetUnread: false,
  line1: "12 J.P. Laurel Avenue",
  landmark: "",
  completeAddress: "12 J.P. Laurel Avenue, Bajada, Davao City",
  accuracyMeters: null,
  precision: null,
  placeName: "",
};

describe("pinStatus", () => {
  it("asks for a pin when there is none", () => {
    expect(pinStatus({ ...BASE, hasPoint: false }).title).toBe(PIN_EMPTY_TITLE);
  });

  it("shows the work in progress before any answer", () => {
    expect(pinStatus({ ...BASE, locating: true })).toEqual({ tone: "busy", title: FINDING_YOU });
    expect(pinStatus({ ...BASE, reversing: true })).toEqual({ tone: "busy", title: READING_PLACE });
  });

  it("confirms the street, the rest of the address once, and the landmark", () => {
    expect(pinStatus({ ...BASE, landmark: "Beside the blue gate" })).toEqual({
      tone: "set",
      title: "12 J.P. Laurel Avenue",
      detail: "Bajada, Davao City",
      landmark: "Beside the blue gate",
      hint: undefined,
    });
  });

  it("leaves out the administrative district", () => {
    const status = pinStatus({
      ...BASE,
      line1: "MacArthur Highway",
      completeAddress: "MacArthur Highway, New Matina, Ma-a, Talomo District, Davao City",
    });
    expect(status.detail).toBe("New Matina, Ma-a, Davao City");
  });

  it("reads a typed street, not only the map's", () => {
    const status = pinStatus({ ...BASE, line1: "Unit 3, Bajada Heights", completeAddress: "" });
    expect(status.title).toBe("Unit 3, Bajada Heights");
    expect(status.detail).toBeUndefined();
  });

  it("is an error outside Davao City", () => {
    expect(pinStatus({ ...BASE, outside: true })).toEqual({
      tone: "error",
      title: OUTSIDE_TITLE,
      detail: OUTSIDE_DAVAO,
    });
  });

  it("asks for the street where the map has none", () => {
    expect(pinStatus({ ...BASE, line1: "", completeAddress: "", streetUnread: true }).title).toBe(
      STREET_UNNAMED_TITLE,
    );
  });

  it("asks to drag a rough phone fix onto the door, and leaves a good one alone", () => {
    expect(pinStatus({ ...BASE, accuracyMeters: 120 }).hint).toMatch(/within about 120 m/);
    expect(pinStatus({ ...BASE, accuracyMeters: 12 }).hint).toBeUndefined();
  });

  it("says a barangay or a road is not yet a door", () => {
    const area = pinStatus({ ...BASE, line1: "", completeAddress: "", precision: "area", placeName: "Talomo Proper" });
    expect(area.title).toBe("Talomo Proper");
    expect(area.hint).toMatch(/middle of Talomo Proper/);
    expect(pinStatus({ ...BASE, precision: "street" }).hint).toMatch(/one stretch of this road/);
    expect(pinStatus({ ...BASE, precision: "exact" }).hint).toBeUndefined();
  });
});
