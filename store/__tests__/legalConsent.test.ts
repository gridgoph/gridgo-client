import { ApiError, acceptLegalVersions, getLegalPending, type LegalVersion } from "@/lib/api";
import { LEGAL_VERSION_CHANGED } from "@/lib/legal";
import { LEGAL_FIRST_READ_MS, legalGateFor, useLegalConsent } from "@/store/legalConsent";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getLegalPending: jest.fn(), acceptLegalVersions: jest.fn() };
});
jest.mock("@/lib/legalContext", () => ({
  legalContext: async () => ({ app: "gridgo-client/test", device: "client-test" }),
}));

const pendingRead = getLegalPending as jest.Mock;
const acceptCall = acceptLegalVersions as jest.Mock;

const terms: LegalVersion = {
  id: "terms-of-service-2",
  documentId: "terms-of-service",
  version: 2,
  title: "Terms of Service",
  audience: "all",
  text: "Real text",
  effectiveAt: "2026-10-01T00:00:00.000Z",
  placeholder: false,
  material: true,
  status: "live",
};

beforeEach(() => {
  useLegalConsent.getState().reset();
  pendingRead.mockReset();
  acceptCall.mockReset();
});

describe("the agreement gate", () => {
  it("closes the app while a document is pending", async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: [terms], notices: [] });
    await useLegalConsent.getState().load("user_1");
    expect(legalGateFor(useLegalConsent.getState(), "user_1")).toBe("blocked");
    expect(useLegalConsent.getState().pending).toEqual([terms]);
  });

  it("is unknown for any other account", async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: [terms], notices: [] });
    await useLegalConsent.getState().load("user_1");
    expect(legalGateFor(useLegalConsent.getState(), "user_2")).toBe("unknown");
  });

  it("lets the client in when the API has no legal library", async () => {
    pendingRead.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    await useLegalConsent.getState().load("user_1");
    expect(useLegalConsent.getState().status).toBe("clear");
  });

  it("fails open on an outage, but keeps a known answer", async () => {
    pendingRead.mockRejectedValueOnce(new TypeError("Network request failed"));
    await useLegalConsent.getState().load("user_1");
    expect(useLegalConsent.getState().status).toBe("clear");

    pendingRead.mockResolvedValueOnce({ blocking: true, pending: [terms], notices: [] });
    await useLegalConsent.getState().load("user_1");
    pendingRead.mockRejectedValueOnce(new TypeError("Network request failed"));
    await useLegalConsent.getState().load("user_1");
    expect(useLegalConsent.getState().status).toBe("blocked");
  });

  it("does not hold the launch past its first-read limit", async () => {
    jest.useFakeTimers();
    try {
      pendingRead.mockReturnValue(new Promise(() => undefined));
      void useLegalConsent.getState().load("user_1");
      expect(useLegalConsent.getState().status).toBe("unknown");
      jest.advanceTimersByTime(LEGAL_FIRST_READ_MS);
      expect(useLegalConsent.getState().status).toBe("clear");
    } finally {
      jest.useRealTimers();
    }
  });

  it("records the versions on screen, by the blocking screen, and opens the app", async () => {
    pendingRead.mockResolvedValue({ blocking: true, pending: [terms], notices: [] });
    await useLegalConsent.getState().load("user_1");
    acceptCall.mockResolvedValue({ blocking: false, pending: [], notices: [], recorded: 1 });

    expect(await useLegalConsent.getState().accept()).toBe(true);
    expect(acceptCall).toHaveBeenCalledWith(["terms-of-service-2"], {
      app: "gridgo-client/test",
      device: "client-test",
    });
    expect(useLegalConsent.getState().status).toBe("clear");
  });

  it("re-reads and asks again when a newer version took effect mid-read", async () => {
    pendingRead.mockResolvedValueOnce({ blocking: true, pending: [terms], notices: [] });
    await useLegalConsent.getState().load("user_1");
    const newer = { ...terms, id: "terms-of-service-3", version: 3 };
    acceptCall.mockRejectedValue(new ApiError(409, { error: "legal_version_changed" }));
    pendingRead.mockResolvedValueOnce({ blocking: true, pending: [newer], notices: [] });

    expect(await useLegalConsent.getState().accept()).toBe(false);
    const state = useLegalConsent.getState();
    expect(state.error).toBe(LEGAL_VERSION_CHANGED);
    expect(state.pending).toEqual([newer]);
    expect(state.status).toBe("blocked");
  });
});
