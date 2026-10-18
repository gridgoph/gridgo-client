/**
 * A drawn signature, from the strokes a finger or mouse leaves on the pad to
 * the PNG GRIDGO keeps as approval evidence (gridgo-api
 * `docs/APPROVAL_PROOF_API.md`, purpose `approval_signature`: PNG, 2 MiB).
 *
 * No library: the pad records points, the screen draws them as SVG paths, and
 * this module rasterises the same points and writes a greyscale PNG with
 * stored (uncompressed) deflate blocks — the same dependency-free approach as
 * `lib/qr.ts`. Everything here is pure, so the bytes are tested rather than
 * trusted.
 */

export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];

/** What the pad holds, in its own layout coordinates. */
export type Signature = {
  width: number;
  height: number;
  strokes: SignatureStroke[];
};

/** Pen width on screen, in layout points. The PNG uses the same, scaled. */
export const SIGNATURE_STROKE_WIDTH = 3;

/** Ink shorter than this is a tap or a dot, not a signature. */
export const SIGNATURE_MIN_INK = 40;

/** The PNG is drawn at twice the pad's size, so the evidence is not blurry. */
export const SIGNATURE_PNG_SCALE = 2;

/** Blank space kept around the ink in the PNG. */
const PNG_MARGIN = 12;

export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

export function emptySignature(width: number, height: number): Signature {
  return { width, height, strokes: [] };
}

/** How much line the strokes hold, in layout points. */
export function inkLength(signature: Signature | null): number {
  if (!signature) return 0;
  let total = 0;
  for (const stroke of signature.strokes) {
    for (let index = 1; index < stroke.length; index += 1) {
      total += Math.hypot(stroke[index].x - stroke[index - 1].x, stroke[index].y - stroke[index - 1].y);
    }
  }
  return total;
}

/** True when there is nothing a person would call a signature. */
export function signatureIsBlank(signature: Signature | null): boolean {
  return inkLength(signature) < SIGNATURE_MIN_INK;
}

/** One stroke as an SVG path. A single point draws as a dot. */
export function strokePath(stroke: SignatureStroke): string {
  if (!stroke.length) return "";
  const [first, ...rest] = stroke;
  const start = `M${round(first.x)} ${round(first.y)}`;
  if (!rest.length) return `${start} L${round(first.x + 0.1)} ${round(first.y)}`;
  return `${start} ${rest.map((point) => `L${round(point.x)} ${round(point.y)}`).join(" ")}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Keeps a point inside the pad: a drag that leaves the box still draws on its edge. */
export function clampPoint(point: SignaturePoint, width: number, height: number): SignaturePoint {
  return {
    x: Math.min(Math.max(point.x, 0), width),
    y: Math.min(Math.max(point.y, 0), height),
  };
}

/** A key that changes whenever the ink does, for "already uploaded this one". */
export function signatureKey(signature: Signature | null): string {
  if (!signature) return "";
  return signature.strokes.map((stroke) => stroke.map((p) => `${round(p.x)},${round(p.y)}`).join(";")).join("|");
}

export type GrayBitmap = { width: number; height: number; pixels: Uint8Array };

/**
 * The strokes as black ink on white, cropped to the ink plus a margin.
 * Each segment is stamped with round discs one pixel apart, which gives the
 * round caps and joins the SVG pad draws.
 */
export function rasterizeSignature(signature: Signature, scale = SIGNATURE_PNG_SCALE): GrayBitmap {
  const radius = (SIGNATURE_STROKE_WIDTH * scale) / 2;
  const points = signature.strokes.flat();
  if (!points.length) return { width: 1, height: 1, pixels: new Uint8Array([255]) };
  const minX = Math.min(...points.map((p) => p.x)) * scale - radius - PNG_MARGIN;
  const minY = Math.min(...points.map((p) => p.y)) * scale - radius - PNG_MARGIN;
  const maxX = Math.max(...points.map((p) => p.x)) * scale + radius + PNG_MARGIN;
  const maxY = Math.max(...points.map((p) => p.y)) * scale + radius + PNG_MARGIN;
  const width = Math.max(1, Math.ceil(maxX - minX));
  const height = Math.max(1, Math.ceil(maxY - minY));
  const pixels = new Uint8Array(width * height).fill(255);

  const stamp = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius * radius) pixels[y * width + x] = 0;
      }
    }
  };

  for (const stroke of signature.strokes) {
    const scaled = stroke.map((p) => ({ x: p.x * scale - minX, y: p.y * scale - minY }));
    stamp(scaled[0].x, scaled[0].y);
    for (let index = 1; index < scaled.length; index += 1) {
      const from = scaled[index - 1];
      const to = scaled[index];
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
      for (let step = 1; step <= steps; step += 1) {
        stamp(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
      }
    }
  }
  return { width, height, pixels };
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array(4 + data.length);
  for (let index = 0; index < 4; index += 1) typed[index] = type.charCodeAt(index);
  typed.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(typed, 4);
  out.set(u32(crc32(typed)), 8 + data.length);
  return out;
}

/** zlib with stored blocks: valid deflate that every PNG reader inflates. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const BLOCK = 65535;
  const blocks = Math.max(1, Math.ceil(raw.length / BLOCK));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let block = 0; block < blocks; block += 1) {
    const part = raw.subarray(block * BLOCK, Math.min(raw.length, (block + 1) * BLOCK));
    out[at] = block === blocks - 1 ? 1 : 0;
    out[at + 1] = part.length & 0xff;
    out[at + 2] = (part.length >>> 8) & 0xff;
    out[at + 3] = ~part.length & 0xff;
    out[at + 4] = (~part.length >>> 8) & 0xff;
    out.set(part, at + 5);
    at += 5 + part.length;
  }
  out.set(u32(adler32(raw)), at);
  return out;
}

/** An 8-bit greyscale PNG. */
export function encodeGrayPng({ width, height, pixels }: GrayBitmap): Uint8Array {
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0; // filter: none
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const header = new Uint8Array([...u32(width), ...u32(height), 8, 0, 0, 0, 0]);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The signature GRIDGO keeps: black on white, cropped to the ink. */
export function signaturePng(signature: Signature): Uint8Array {
  let scale = SIGNATURE_PNG_SCALE;
  let png = encodeGrayPng(rasterizeSignature(signature, scale));
  // A huge pad on a desktop browser must still fit the 2 MiB evidence limit.
  while (png.length > SIGNATURE_MAX_BYTES && scale > 0.5) {
    scale /= 2;
    png = encodeGrayPng(rasterizeSignature(signature, scale));
  }
  return png;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    out += BASE64[a >> 2];
    out += BASE64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : BASE64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : BASE64[c & 63];
  }
  return out;
}
