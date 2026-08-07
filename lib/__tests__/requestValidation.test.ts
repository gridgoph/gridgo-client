import {
  buildPreflightChecklist,
  validateArtworkStep,
  validateDetailsStep,
  validateStep,
} from "@/lib/requestValidation";

const completeDraft = {
  productId: "prod_flyer",
  title: "Event flyers",
  size: "A5",
  material: "matte 150gsm",
  quantity: 5,
  deadline: "2026-08-15T10:00:00+08:00",
  address: "Matina Crossing, Davao City",
  zone: "davao_south",
  artworkName: "flyers.pdf",
};

describe("validateDetailsStep", () => {
  it("passes a complete details form", () => {
    expect(validateDetailsStep(completeDraft).ok).toBe(true);
  });

  it("returns an explicit reason when product is missing", () => {
    const result = validateDetailsStep({ ...completeDraft, productId: "" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/product/i);
  });

  it("rejects quantity below 1", () => {
    const result = validateDetailsStep({ ...completeDraft, quantity: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/quantity/i);
  });
});

describe("validateArtworkStep", () => {
  it("requires a file name and explains demo storage", () => {
    const result = validateArtworkStep({ artworkName: "  " });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/name only/i);
  });

  it("accepts a file name", () => {
    expect(validateArtworkStep({ artworkName: "art.pdf" }).ok).toBe(true);
  });
});

describe("validateStep", () => {
  it("routes by step id", () => {
    expect(validateStep("details", { ...completeDraft, size: "" }).ok).toBe(false);
    expect(validateStep("artwork", completeDraft).ok).toBe(true);
    expect(validateStep("confirm", completeDraft).ok).toBe(true);
  });
});

describe("buildPreflightChecklist", () => {
  it("fails file item without a name", () => {
    const items = buildPreflightChecklist("");
    expect(items.find((i) => i.id === "file")?.status).toBe("fail");
  });

  it("passes file item when a name is present", () => {
    const items = buildPreflightChecklist("banner.pdf");
    expect(items.find((i) => i.id === "file")?.status).toBe("pass");
    expect(items.find((i) => i.id === "bleed")?.status).toBe("pending");
  });
});
