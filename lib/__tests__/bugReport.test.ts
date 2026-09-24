import { ExecutionEnvironment } from "expo-constants";

import { sendSupportChatMessage } from "@/lib/api";
import {
  BUG_REPORT_HEADING,
  HAPPENED_MIN,
  bugReportOrderLine,
  bugReportProblem,
  composeBugReport,
  describeDevice,
  recentOrdersForReport,
} from "@/lib/bugReport";

const ANDROID = {
  OS: "android",
  Version: 34,
  constants: {
    Brand: "samsung",
    Manufacturer: "samsung",
    Model: "SM-A546E",
    Release: "14",
    Serial: "R58T1234ABC",
    Fingerprint: "samsung/a54xnsxx/a54x:14/UP1A.231005.007/A546EXXS8CXK1:user/release-keys",
  },
};

const DEVICE = { app: "GRIDGO Client 1.0.42", phone: "Samsung SM-A546E", system: "Android 14" };

const ORDER = {
  id: "ord_3ff0128e105a",
  title: "Tarpaulin 3x6",
  state: "needs_qa",
  fulfillmentMode: "delivery" as const,
};

describe("bugReportProblem", () => {
  it("needs something in what happened", () => {
    expect(bugReportProblem({ happened: "   ", expected: "" })).toBe("Say what happened.");
  });

  it("asks for a sentence rather than a word", () => {
    expect(bugReportProblem({ happened: "broken", expected: "" })).toMatch(String(HAPPENED_MIN));
  });

  it("lets a report go without an expectation", () => {
    expect(bugReportProblem({ happened: "The Pay button did nothing.", expected: "" })).toBeNull();
  });
});

describe("composeBugReport", () => {
  it("leads with the heading the desk's preview shows, then the client's words, then the facts", () => {
    const body = composeBugReport(
      { happened: "  The Pay button did nothing.  ", expected: "The QR code." },
      DEVICE,
      ORDER,
    );

    expect(body).toBe(
      [
        BUG_REPORT_HEADING,
        "",
        "What happened:",
        "The Pay button did nothing.",
        "",
        "What I expected:",
        "The QR code.",
        "",
        "Order: 3FF0-128E-105A, Tarpaulin 3x6 (In artwork check)",
        "App: GRIDGO Client 1.0.42",
        "Phone: Samsung SM-A546E",
        "System: Android 14",
      ].join("\n"),
    );
  });

  it("leaves out what the client did not give and the phone does not know", () => {
    const body = composeBugReport(
      { happened: "The app closed on the match screen.", expected: "  " },
      { app: "GRIDGO Client 1.0.0", phone: null, system: "Web browser" },
      null,
    );

    expect(body).not.toMatch("What I expected");
    expect(body).not.toMatch("Order:");
    expect(body).not.toMatch("Phone:");
    expect(body.endsWith("App: GRIDGO Client 1.0.0\nSystem: Web browser")).toBe(true);
  });

  it("fits in one chat message at the longest the form allows", () => {
    const body = composeBugReport(
      { happened: "x".repeat(1500), expected: "y".repeat(1000) },
      DEVICE,
      { ...ORDER, title: "z".repeat(200) },
    );
    // gridgo-api refuses a support-chat body over 4000 characters.
    expect(body.length).toBeLessThanOrEqual(4000);
  });
});

describe("bugReportOrderLine", () => {
  it("quotes the reference Operations searches by, even without a title", () => {
    expect(bugReportOrderLine({ ...ORDER, title: "" })).toBe("3FF0-128E-105A (In artwork check)");
  });
});

describe("describeDevice", () => {
  it("names an Android phone by brand and model, never serial or fingerprint", () => {
    const device = describeDevice(ANDROID, "1.0.42", ExecutionEnvironment.Standalone);

    expect(device).toEqual(DEVICE);
    expect(JSON.stringify(device)).not.toMatch("R58T1234ABC");
    expect(JSON.stringify(device)).not.toMatch("release-keys");
  });

  it("does not say the brand twice when the model already carries it", () => {
    const device = describeDevice(
      { ...ANDROID, constants: { Brand: "Redmi", Model: "Redmi Note 12", Release: "13" } },
      "1.0.42",
    );
    expect(device.phone).toBe("Redmi Note 12");
  });

  it("marks an Expo Go session, which is not the build clients install", () => {
    expect(describeDevice(ANDROID, "1.0.0", ExecutionEnvironment.StoreClient).app).toBe(
      "GRIDGO Client 1.0.0 (Expo Go)",
    );
  });

  it("describes an iPhone by kind and system", () => {
    expect(
      describeDevice(
        { OS: "ios", Version: "18.2", constants: { systemName: "iOS", osVersion: "18.2", interfaceIdiom: "phone" } },
        "1.0.42",
      ),
    ).toEqual({ app: "GRIDGO Client 1.0.42", phone: "iPhone", system: "iOS 18.2" });
  });

  it("says when the version is not known rather than guessing one", () => {
    expect(describeDevice(ANDROID, undefined).app).toBe("GRIDGO Client unknown version");
  });
});

describe("recentOrdersForReport", () => {
  it("puts the most recently touched orders first and keeps a short list", () => {
    const orders = Array.from({ length: 12 }, (_, index) => ({
      id: `ord_${index}`,
      createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      updatedAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const recent = recentOrdersForReport(orders);

    expect(recent).toHaveLength(8);
    expect(recent[0]?.id).toBe("ord_11");
    expect(recent[7]?.id).toBe("ord_4");
  });
});

describe("sendSupportChatMessage", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function captureBody() {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ thread: { id: "t1" }, message: { id: "m1" } }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    return () => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
      return JSON.parse(String(calls[0]?.[1]?.body));
    };
  }

  it("asks for a new conversation when a report starts one", async () => {
    const body = captureBody();
    await sendSupportChatMessage("Bug report", undefined, { newThread: true });
    expect(body()).toEqual({ body: "Bug report", newThread: true });
  });

  it("keeps an ordinary message on the thread it names", async () => {
    const body = captureBody();
    await sendSupportChatMessage("Hello", "t1", { newThread: true });
    expect(body()).toEqual({ body: "Hello", threadId: "t1" });
  });
});
