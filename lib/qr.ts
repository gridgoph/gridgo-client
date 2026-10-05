/**
 * A QR code encoder, byte mode only, versions 1–10.
 *
 * The client shows exactly one QR: the hub claim token (gridgo-api#124), an
 * opaque 43-character string the hub staff scan. That is too small a job for a
 * new dependency, so the symbol is built here from ISO/IEC 18004 and drawn by
 * `components/ClaimQr.tsx` with react-native-svg. `lib/__tests__/qr.test.ts`
 * holds golden matrices from a reference encoder, so a slip in the tables or
 * the placement fails a test rather than a scan at the counter.
 *
 * Byte mode with no ECI is the only mode: base64url, the claim token's
 * alphabet, does not fit alphanumeric mode (lower case), and a scanner reads a
 * byte segment back as the same ASCII text.
 */

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export type QrMatrix = {
  /** Modules per side, without the quiet zone. */
  size: number;
  version: number;
  mask: number;
  /** `modules[y][x]`, true is dark. */
  modules: boolean[][];
};

const MAX_VERSION = 10;

/** Index = version; index 0 unused. ISO/IEC 18004 table 9. */
const ECC_CODEWORDS_PER_BLOCK: Record<QrErrorCorrection, number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};

const ECC_BLOCKS: Record<QrErrorCorrection, number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

/** The two format-information bits for each level. */
const FORMAT_BITS: Record<QrErrorCorrection, number> = { L: 1, M: 0, Q: 3, H: 2 };

function bit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

/** Modules left for data and error correction once every pattern is drawn. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number, ecl: QrErrorCorrection): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl][version] * ECC_BLOCKS[ecl][version]
  );
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) {
    result.splice(1, 0, position);
  }
  return result;
}

// Reed–Solomon over GF(2^8) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const value of data) {
    const factor = value ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** Mode indicator, character count, the bytes, terminator and padding. */
function dataCodewordsFor(bytes: number[], version: number, ecl: QrErrorCorrection): number[] {
  const capacityBits = dataCodewords(version, ecl) * 8;
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  append(0b0100, 4);
  append(bytes.length, version <= 9 ? 8 : 16);
  for (const value of bytes) append(value, 8);
  append(0, Math.min(4, capacityBits - bits.length));
  append(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) append(pad, 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, value) => (acc << 1) | value, 0));
  }
  return codewords;
}

function interleaveWithEcc(data: number[], version: number, ecl: QrErrorCorrection): number[] {
  const blocks = ECC_BLOCKS[ecl][version];
  const eccLength = ECC_CODEWORDS_PER_BLOCK[ecl][version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (rawCodewords % blocks);
  const shortLength = Math.floor(rawCodewords / blocks);
  const divisor = rsDivisor(eccLength);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const chunk = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += chunk.length;
    const ecc = rsRemainder(chunk, divisor);
    if (i < shortBlocks) chunk.push(0);
    all.push(chunk.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < all[0].length; i++) {
    all.forEach((block, j) => {
      // Short blocks carry a placeholder in the column only long blocks fill.
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]);
    });
  }
  return result;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Grid {
  readonly modules: boolean[][];
  readonly reserved: boolean[][];
  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  fixed(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.reserved[y][x] = true;
  }
}

function drawFormat(grid: Grid, ecl: QrErrorCorrection, mask: number) {
  const data = (FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const size = grid.size;
  for (let i = 0; i <= 5; i++) grid.fixed(8, i, bit(bits, i));
  grid.fixed(8, 7, bit(bits, 6));
  grid.fixed(8, 8, bit(bits, 7));
  grid.fixed(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) grid.fixed(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) grid.fixed(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) grid.fixed(8, size - 15 + i, bit(bits, i));
  grid.fixed(8, size - 8, true);
}

function drawFunctionPatterns(grid: Grid, version: number) {
  const size = grid.size;
  for (let i = 0; i < size; i++) {
    grid.fixed(6, i, i % 2 === 0);
    grid.fixed(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        grid.fixed(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  positions.forEach((cx, i) => {
    positions.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          grid.fixed(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });
  // Reserve the format area now; the real bits are drawn once the mask is known.
  drawFormat(grid, "M", 0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      grid.fixed(a, b, bit(bits, i));
      grid.fixed(b, a, bit(bits, i));
    }
  }
}

function drawCodewords(grid: Grid, codewords: number[]) {
  const size = grid.size;
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!grid.reserved[y][x] && index < codewords.length * 8) {
          grid.modules[y][x] = bit(codewords[index >>> 3], 7 - (index & 7));
          index++;
        }
      }
    }
  }
}

function applyMask(grid: Grid, mask: number) {
  const test = MASKS[mask];
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!grid.reserved[y][x] && test(x, y)) grid.modules[y][x] = !grid.modules[y][x];
    }
  }
}

const FINDER_LIKE = [
  [true, false, true, true, true, false, true, false, false, false, false],
  [false, false, false, false, true, false, true, true, true, false, true],
];

/** The standard's four penalty rules; the lowest-scoring mask is drawn. */
function penalty(modules: boolean[][]): number {
  const size = modules.length;
  const at = (x: number, y: number, column: boolean) => (column ? modules[x][y] : modules[y][x]);
  let score = 0;
  for (const column of [false, true]) {
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x <= size; x++) {
        if (x < size && at(x, y, column) === at(x - 1, y, column)) {
          run++;
          continue;
        }
        if (run >= 5) score += 3 + run - 5;
        run = 1;
      }
      for (let x = 0; x + 11 <= size; x++) {
        for (const pattern of FINDER_LIKE) {
          if (pattern.every((dark, k) => at(x + k, y, column) === dark)) score += 40;
        }
      }
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++;
      if (
        x + 1 < size &&
        y + 1 < size &&
        modules[y][x] === modules[y][x + 1] &&
        modules[y][x] === modules[y + 1][x] &&
        modules[y][x] === modules[y + 1][x + 1]
      ) {
        score += 3;
      }
    }
  }
  const total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Encode `text` as the smallest QR symbol that holds it at `ecl`.
 * Pass `mask` to force a mask pattern; otherwise the lowest-penalty one wins.
 * Throws when the text does not fit version 10.
 */
export function encodeQr(
  text: string,
  { ecl = "M", mask }: { ecl?: QrErrorCorrection; mask?: number } = {},
): QrMatrix {
  const bytes = utf8Bytes(text);
  let version = 1;
  for (; version <= MAX_VERSION; version++) {
    const countBits = version <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version, ecl) * 8) break;
  }
  if (version > MAX_VERSION) throw new Error("QR payload too long");

  const codewords = interleaveWithEcc(dataCodewordsFor(bytes, version, ecl), version, ecl);
  const build = (pattern: number) => {
    const grid = new Grid(version * 4 + 17);
    drawFunctionPatterns(grid, version);
    drawCodewords(grid, codewords);
    applyMask(grid, pattern);
    drawFormat(grid, ecl, pattern);
    return grid;
  };

  if (mask != null) {
    if (!Number.isInteger(mask) || mask < 0 || mask > 7) throw new Error("QR mask must be 0–7");
    const grid = build(mask);
    return { size: grid.size, version, mask, modules: grid.modules };
  }
  let best: { grid: Grid; mask: number; score: number } | null = null;
  for (let pattern = 0; pattern < 8; pattern++) {
    const grid = build(pattern);
    const score = penalty(grid.modules);
    if (!best || score < best.score) best = { grid, mask: pattern, score };
  }
  const chosen = best as { grid: Grid; mask: number };
  return { size: chosen.grid.size, version, mask: chosen.mask, modules: chosen.grid.modules };
}

/**
 * One SVG path for every dark module, offset by the quiet zone. A single path
 * keeps the draw to one native node however dense the symbol.
 */
export function qrPath(matrix: QrMatrix, quietZone = 4): string {
  const parts: string[] = [];
  matrix.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
    });
  });
  return parts.join("");
}
