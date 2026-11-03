import { pinWebColorScheme } from "@/lib/webColorScheme";

/** A stylesheet shaped like the compiled `global.css`: the Dark tokens sit in one media rule. */
function sheets() {
  const dark = { media: { mediaText: "(prefers-color-scheme: dark)" }, cssRules: [] };
  const print = { media: { mediaText: "print" }, cssRules: [] };
  const layer = { cssRules: [dark] };
  const source = { styleSheets: [{ cssRules: [layer, print] }] } as unknown as Parameters<typeof pinWebColorScheme>[1];
  return { source, dark, print };
}

it("turns the Dark tokens on, off, and back to the browser's setting", () => {
  const { source, dark, print } = sheets();

  pinWebColorScheme("dark", source);
  expect(dark.media.mediaText).toBe("all");

  pinWebColorScheme("light", source);
  expect(dark.media.mediaText).toBe("not all");

  pinWebColorScheme(null, source);
  expect(dark.media.mediaText).toBe("(prefers-color-scheme: dark)");
  expect(print.media.mediaText).toBe("print");
});

it("skips a stylesheet it may not read", () => {
  const { dark } = sheets();
  const locked = {
    get cssRules(): never {
      throw new Error("SecurityError");
    },
  };
  const source = { styleSheets: [locked, { cssRules: [dark] }] } as unknown as Parameters<typeof pinWebColorScheme>[1];

  pinWebColorScheme("dark", source);
  expect(dark.media.mediaText).toBe("all");
});
