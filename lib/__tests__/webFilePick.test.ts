import { Platform } from "react-native";

import { canPickOnWeb, pickFileOnWeb } from "@/lib/webFilePick";

function mockFileInput(file: File | null) {
  const listeners: Record<string, Array<() => void>> = {};
  const input = {
    type: "",
    accept: "",
    multiple: false,
    files: file ? ([file] as unknown as FileList) : ([] as unknown as FileList),
    setAttribute: jest.fn(),
    addEventListener: jest.fn((event: string, handler: () => void) => {
      (listeners[event] ??= []).push(handler);
    }),
    click: jest.fn(() => {
      for (const handler of listeners.change ?? []) handler();
    }),
    remove: jest.fn(),
  };
  const previous = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        if (tag === "input") return input;
        return previous?.createElement?.(tag);
      },
      body: { appendChild: jest.fn() },
    },
  });
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:gridgo-test",
    });
  }
  return { input, previous };
}

describe("pickFileOnWeb", () => {
  const original = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => original,
    });
  });

  it("does not pretend a phone file dialog is a browser one", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => "ios",
    });
    expect(canPickOnWeb()).toBe(false);
  });

  it("opens a file input on web and returns the chosen file", async () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      get: () => "web",
    });
    const file = new File(["shot"], "receipt.png", { type: "image/png" });
    const { input, previous } = mockFileInput(file);
    try {
      expect(canPickOnWeb()).toBe(true);
      const picked = await pickFileOnWeb("image/*");
      expect(input.accept).toBe("image/*");
      expect(input.click).toHaveBeenCalled();
      expect(picked).toEqual(
        expect.objectContaining({
          name: "receipt.png",
          mimeType: "image/png",
          file,
        }),
      );
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previous,
      });
    }
  });
});
