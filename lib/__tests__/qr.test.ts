import { encodeQr, qrPath } from "@/lib/qr";

/*
  Golden symbols from a reference encoder (the `qrcode` npm package, forced to
  byte mode). Each covers a different path: the claim token's own shape
  (version 4, one block), a version that carries version information and
  split blocks (8), and the highest correction level (1-H). The encoder was
  also checked against the reference for every level, every mask and versions
  1–10 when it was written; these keep that check without the dependency.
*/
const GOLDEN: { text: string; ecl: "L" | "M" | "Q" | "H"; version: number; mask: number; hex: string }[] = [
  {
    text: "Xq3_-Zr8pLmN0oPqRsTuVwXyZaBcDeFgHiJkLmNoPqR",
    ecl: "M",
    version: 4,
    mask: 4,
    hex:
      "fea7813fc1231c506e92df4bb75038e5dbad4962ec142a7d07faaaaafe01f4f9008b9d03" +
      "7cb83d6bc18ccdca5c4ead91578d36c93a574a13c6822af53ca5900b8c0006b056bb3a16" +
      "c109c88871fcc399ddbe38630392ee2e06918479fb5e7c4a80fa03cf0702f900766b46bf" +
      "b04a2ad04872519bade92f8dd143c58ae9cc2a2904678d10fefa57fa8",
  },
  {
    text: "GRIDGO-".repeat(20),
    ecl: "M",
    version: 8,
    mask: 4,
    hex:
      "fef28cf6ccbfc12010d18dd06e9a181e3c6bb756226948a5dba9bfbfe5c2ec159871b0b1" +
      "07faaaaaaaaafe01278c706e008bfc2bf2f87cd8d0e5d767b36beca6c7388490b9b26644" +
      "1466e9d79a6fd49f208d31f699ee0e70b41681d9fbe473f06da5e2d1789af809ea8fa6b7" +
      "afb07ba9e4291e951f16a36f8b90416ed39d0ce48647536c329b203e068fb5a7e47124e4" +
      "502d15ca8a8ab4faa96c5fa71f8d464be4effb167e0f8d66b31e6a462940ab5ba3c5c007" +
      "c8f2d465bc61d727a641a3cf8db22eb69e49d1a4fad930c13dfb017573e4a7b154249598" +
      "1f03c6a975b2e7e969818ec9695dbe977519d34b558440e242dc362abde2015bf4d8fb80" +
      "5e771921c47fa46da9dd2b104287c78b917bad97ff0cef8dd343073292f6e8c1a935a2c7" +
      "04adf324098efe9a7ca4d88b8",
  },
  {
    text: "HELLO",
    ecl: "H",
    version: 1,
    mask: 4,
    hex:
      "fe4bfc17106e96bb74e5dba6aec17107faafe01d000f4b15ce3bf3da64e9750f3f030070" +
      "2ffa39505ee2ba91add292ee9571042c0fe59a8",
  },

];

function toHex(modules: boolean[][]): string {
  const bits = modules.flat().map((dark) => (dark ? "1" : "0")).join("");
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4).padEnd(4, "0"), 2).toString(16);
  return hex;
}

describe("encodeQr", () => {
  it.each(GOLDEN)("draws the reference symbol for version $version-$ecl", (fixture) => {
    const matrix = encodeQr(fixture.text, { ecl: fixture.ecl });
    expect(matrix.version).toBe(fixture.version);
    expect(matrix.mask).toBe(fixture.mask);
    expect(matrix.size).toBe(fixture.version * 4 + 17);
    expect(toHex(matrix.modules)).toBe(fixture.hex);
  });

  it("fits a 256-bit base64url claim token in a 33-module symbol at level M", () => {
    const token = "A".repeat(43);
    const matrix = encodeQr(token);
    expect(matrix.version).toBe(4);
    expect(matrix.size).toBe(33);
  });

  it("honours a forced mask and refuses one out of range", () => {
    expect(encodeQr("GRIDGO", { mask: 6 }).mask).toBe(6);
    expect(() => encodeQr("GRIDGO", { mask: 8 })).toThrow("QR mask must be 0–7");
  });

  it("refuses a payload larger than version 10 holds", () => {
    expect(() => encodeQr("x".repeat(300), { ecl: "H" })).toThrow("QR payload too long");
  });
});

describe("qrPath", () => {
  it("draws one unit square per dark module, inside the quiet zone", () => {
    const matrix = encodeQr("HELLO", { ecl: "H" });
    const dark = matrix.modules.flat().filter(Boolean).length;
    const path = qrPath(matrix);
    expect(path.match(/M/g)).toHaveLength(dark);
    // The top-left finder's corner module sits at the quiet zone's edge.
    expect(path.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});
