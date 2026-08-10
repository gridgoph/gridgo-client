import {
  describeArtworkFile,
  formatBytes,
  validateArtworkStep,
  validateDetailsStep,
  validateStep,
  type RequestDraftFields,
} from "@/lib/requestValidation";

const NOW = new Date("2026-08-09T08:00:00+08:00").getTime();

const completeDraft: RequestDraftFields = {
  productId: "prod_flyer",
  unit: "pack100",
  title: "Event flyers",
  size: "A5",
  material: "Matte 150gsm",
  finish: "",
  quantity: 5,
  deadline: new Date(NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
  addressLine1: "12 McArthur Highway",
  barangay: "Matina Crossing",
  landmark: "",
  zone: "davao_south",
  artworkFileId: "file_abc123",
  artworkName: "flyers.pdf",
};

describe("validateDetailsStep", () => {
  it("passes a complete details form", () => {
    expect(validateDetailsStep(completeDraft, NOW).ok).toBe(true);
  });

  it("returns an explicit reason when product is missing", () => {
    const result = validateDetailsStep({ ...completeDraft, productId: "" }, NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/what you are printing/i);
  });

  it("rejects a quantity above what the unit allows", () => {
    const result = validateDetailsStep({ ...completeDraft, quantity: 5000 }, NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/packs of 100/i);
  });

  it("rejects a deadline inside the minimum lead time", () => {
    const result = validateDetailsStep(
      { ...completeDraft, deadline: new Date(NOW + 60 * 60 * 1000).toISOString() },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/earliest deadline/i);
  });

  it("asks for the barangay before the street line is accepted alone", () => {
    const result = validateDetailsStep({ ...completeDraft, barangay: " " }, NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/barangay/i);
  });

  it("never leaks an internal field name into the reason", () => {
    const result = validateDetailsStep({ ...completeDraft, material: "" }, NOW);
    expect(result.reason).not.toMatch(/[a-z]+_[a-z]+/);
  });
});

describe("validateArtworkStep", () => {
  it("blocks until the server has confirmed the file", () => {
    const result = validateArtworkStep({ artworkFileId: "  " });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/server confirms/i);
  });

  it("accepts a server-issued file id", () => {
    expect(validateArtworkStep({ artworkFileId: "file_abc123" }).ok).toBe(true);
  });

  it("does not accept a file name standing in for an upload", () => {
    const result = validateStep(
      "artwork",
      { ...completeDraft, artworkFileId: "", artworkName: "flyers.pdf" },
      NOW,
    );
    expect(result.ok).toBe(false);
  });
});

describe("validateStep", () => {
  it("routes by step id", () => {
    expect(validateStep("details", { ...completeDraft, size: "" }, NOW).ok).toBe(false);
    expect(validateStep("artwork", completeDraft, NOW).ok).toBe(true);
    expect(validateStep("confirm", completeDraft, NOW).ok).toBe(true);
  });
});

describe("describeArtworkFile", () => {
  it("reports only facts the server actually returned", () => {
    const facts = describeArtworkFile({
      originalFilename: "banner.pdf",
      detectedContentType: "application/pdf",
      size: 4_800_000,
    });
    expect(facts.map((fact) => fact.id)).toEqual(["name", "format", "size"]);
    expect(facts.find((fact) => fact.id === "format")?.value).toBe("PDF");
    expect(facts.every((fact) => fact.tone === "neutral")).toBe(true);
  });

  it("flags a file small enough to be a screen export", () => {
    const facts = describeArtworkFile({
      originalFilename: "banner.png",
      detectedContentType: "image/png",
      size: 40_000,
    });
    expect(facts.find((fact) => fact.id === "size")?.tone).toBe("warn");
  });
});

describe("formatBytes", () => {
  it("scales to a unit a person reads", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(204_800)).toBe("200 KB");
    expect(formatBytes(5_242_880)).toBe("5.0 MB");
  });
});
