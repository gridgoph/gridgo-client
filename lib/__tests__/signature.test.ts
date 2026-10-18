import { inflateSync } from "node:zlib";

import {
  bytesToBase64,
  clampPoint,
  encodeGrayPng,
  inkLength,
  rasterizeSignature,
  signatureIsBlank,
  signatureKey,
  signaturePng,
  SIGNATURE_MAX_BYTES,
  strokePath,
  type Signature,
} from "@/lib/signature";

const SIGNED: Signature = {
  width: 300,
  height: 180,
  strokes: [
    [
      { x: 20, y: 120 },
      { x: 80, y: 60 },
      { x: 140, y: 120 },
    ],
    [{ x: 200, y: 90 }],
  ],
};

/** Reads an 8-bit greyscale PNG back with Node's own inflate. */
function decode(png: Uint8Array) {
  const view = Buffer.from(png);
  expect([...view.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  const types: string[] = [];
  while (at < view.length) {
    const length = view.readUInt32BE(at);
    const type = view.toString("ascii", at + 4, at + 8);
    const data = view.subarray(at + 8, at + 8 + length);
    types.push(type);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8)]).toEqual([8, 0, 0, 0, 0]);
    }
    if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * (width + 1)]).toBe(0);
    pixels.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  }
  return { width, height, pixels, types };
}

describe("a drawn signature", () => {
  it("is blank until there is enough ink to be a signature", () => {
    expect(signatureIsBlank(null)).toBe(true);
    expect(signatureIsBlank({ width: 300, height: 180, strokes: [[{ x: 10, y: 10 }]] })).toBe(true);
    expect(signatureIsBlank({ width: 300, height: 180, strokes: [[{ x: 10, y: 10 }, { x: 30, y: 10 }]] })).toBe(true);
    expect(inkLength(SIGNED)).toBeGreaterThan(160);
    expect(signatureIsBlank(SIGNED)).toBe(false);
  });

  it("draws each stroke as an SVG path, and a single point as a dot", () => {
    expect(strokePath(SIGNED.strokes[0])).toBe("M20 120 L80 60 L140 120");
    expect(strokePath(SIGNED.strokes[1])).toBe("M200 90 L200.1 90");
    expect(strokePath([])).toBe("");
  });

  it("keeps a drag that leaves the box on its edge", () => {
    expect(clampPoint({ x: -5, y: 400 }, 300, 180)).toEqual({ x: 0, y: 180 });
  });

  it("changes its key whenever the ink changes", () => {
    const more = { ...SIGNED, strokes: [...SIGNED.strokes, [{ x: 5, y: 5 }, { x: 9, y: 9 }]] };
    expect(signatureKey(SIGNED)).not.toBe(signatureKey(more));
    expect(signatureKey(SIGNED)).toBe(signatureKey({ ...SIGNED }));
  });
});

describe("the signature PNG GRIDGO keeps", () => {
  it("is a valid greyscale PNG that a standard reader inflates to the same pixels", () => {
    const bitmap = rasterizeSignature(SIGNED);
    const decoded = decode(encodeGrayPng(bitmap));
    expect(decoded.types).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(decoded.width).toBe(bitmap.width);
    expect(decoded.height).toBe(bitmap.height);
    expect(Buffer.from(decoded.pixels).equals(Buffer.from(bitmap.pixels))).toBe(true);
  });

  it("is black ink on white, cropped to the ink with a margin", () => {
    const { width, height, pixels } = rasterizeSignature(SIGNED, 2);
    // Ink spans x 20..200 and y 60..120 at twice the pad's size, plus pen and margin.
    expect(width).toBeGreaterThan(360);
    expect(width).toBeLessThan(400);
    expect(height).toBeGreaterThan(120);
    expect(height).toBeLessThan(160);
    expect(pixels[0]).toBe(255);
    const ink = pixels.filter((value) => value === 0).length;
    expect(ink).toBeGreaterThan(500);
    expect(new Set(pixels)).toEqual(new Set([0, 255]));
  });

  it("splits a large image across stored deflate blocks and stays under 2 MiB", () => {
    const wide: Signature = {
      width: 1200,
      height: 600,
      strokes: [[{ x: 0, y: 0 }, { x: 1200, y: 600 }]],
    };
    const png = signaturePng(wide);
    expect(png.length).toBeLessThanOrEqual(SIGNATURE_MAX_BYTES);
    const decoded = decode(png);
    expect(decoded.width).toBeGreaterThan(1000);
  });

  it("encodes base64 the same way Node does", () => {
    for (const bytes of [new Uint8Array([]), new Uint8Array([1]), new Uint8Array([1, 2]), signaturePng(SIGNED)]) {
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });
});
