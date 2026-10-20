import { Platform } from "react-native";

import { ApiError, getAcknowledgementReceipt } from "@/lib/api";
import { downloadAcknowledgementReceipt } from "@/lib/acknowledgementReceipt";
import * as nativeModules from "@/lib/nativeModules";

const fetchMock = global.fetch as jest.Mock;

function answer(status: number, body: unknown) {
  fetchMock.mockImplementationOnce(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }));
}

describe("GET /orders/:id/acknowledgement-receipt", () => {
  it("returns the issued receipt as sent", async () => {
    answer(200, { receipt: { arNumber: "AR-0000000001", orderId: "ord_1" } });
    await expect(getAcknowledgementReceipt("ord_1")).resolves.toMatchObject({ arNumber: "AR-0000000001" });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/orders\/ord_1\/acknowledgement-receipt$/);
  });

  it("reads 'none issued' as no receipt", async () => {
    answer(404, { error: "acknowledgement_receipt_not_found" });
    await expect(getAcknowledgementReceipt("ord_1")).resolves.toBeNull();
  });

  it("never mistakes another refusal for 'none issued'", async () => {
    answer(404, { error: "order_not_found" });
    await expect(getAcknowledgementReceipt("ord_1")).rejects.toBeInstanceOf(ApiError);
    answer(403, { error: "forbidden" });
    await expect(getAcknowledgementReceipt("ord_1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("downloading on the web", () => {
  const original = Platform.OS;
  let clicked: { href: string; download: string }[];

  beforeEach(() => {
    clicked = [];
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    (global as unknown as { document: unknown }).document = {
      createElement: () => {
        const link = {
          href: "",
          download: "",
          click: () => clicked.push({ href: link.href, download: link.download }),
          remove: () => undefined,
        };
        return link;
      },
      body: { appendChild: () => undefined },
    };
    // The web build derives the API host from the page it was served from.
    (window as unknown as { location: unknown }).location = { hostname: "localhost" };
    URL.createObjectURL = jest.fn(() => "blob:receipt");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    delete (global as unknown as { document?: unknown }).document;
    delete (window as unknown as { location?: unknown }).location;
  });

  it("fetches the PDF with the session and saves it as <arNumber>.pdf", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, blob: async () => ({ size: 1 }) }));
    const result = await downloadAcknowledgementReceipt({ orderId: "ord_1", arNumber: "AR-0000000001" });

    expect(result).toEqual({ ok: true, message: "Downloaded AR-0000000001.pdf." });
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toMatch(/\/orders\/ord_1\/acknowledgement-receipt\/download$/);
    expect(init.headers.Accept).toBe("application/pdf");
    expect(clicked).toEqual([{ href: "blob:receipt", download: "AR-0000000001.pdf" }]);
  });

  it("reports a refusal instead of saving an error page", async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: "forbidden" }),
    }));
    const result = await downloadAcknowledgementReceipt({ orderId: "ord_1", arNumber: "AR-0000000001" });

    expect(result).toEqual({
      ok: false,
      message: "This receipt can only be downloaded by the account that placed the order.",
    });
    expect(clicked).toEqual([]);
  });
});

describe("downloading on Android", () => {
  const original = Platform.OS;
  const fileSystem = {
    cacheDirectory: "file:///cache/",
    EncodingType: { Base64: "base64" },
    downloadAsync: jest.fn(async (_url: string, local: string) => ({ status: 200, uri: local })),
    readAsStringAsync: jest.fn(async () => "JVBERi0="),
    writeAsStringAsync: jest.fn(async () => undefined),
    StorageAccessFramework: {
      requestDirectoryPermissionsAsync: jest.fn(async () => ({ granted: true, directoryUri: "content://downloads" })),
      createFileAsync: jest.fn(async () => "content://downloads/AR-0000000001.pdf"),
    },
  };

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    jest.spyOn(nativeModules, "getFileSystemLegacyNative").mockReturnValue(
      fileSystem as unknown as ReturnType<typeof nativeModules.getFileSystemLegacyNative>,
    );
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    jest.restoreAllMocks();
  });

  it("downloads with the session and saves the PDF into the folder the client picks", async () => {
    const result = await downloadAcknowledgementReceipt({ orderId: "ord_1", arNumber: "AR-0000000001" });

    expect(result).toEqual({ ok: true, message: "Saved AR-0000000001.pdf." });
    const [url, local, options] = fileSystem.downloadAsync.mock.calls[0] as unknown as [
      string,
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toMatch(/\/orders\/ord_1\/acknowledgement-receipt\/download$/);
    expect(local).toBe("file:///cache/AR-0000000001.pdf");
    expect(options.headers.Accept).toBe("application/pdf");
    expect(fileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      "content://downloads",
      "AR-0000000001",
      "application/pdf",
    );
    expect(fileSystem.writeAsStringAsync).toHaveBeenCalledWith("content://downloads/AR-0000000001.pdf", "JVBERi0=", {
      encoding: "base64",
    });
  });
});
