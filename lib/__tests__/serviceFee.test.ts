import {
  SERVICE_FEE_EXPLAINER,
  formatServiceFeeRate,
  serviceFeeLabel,
  serviceFeeVisibleToClient,
  showsServiceFee,
} from "@/lib/serviceFee";

describe("formatServiceFeeRate", () => {
  it("reads the live rate rather than a hardcoded 3%", () => {
    expect(formatServiceFeeRate(300)).toBe("3%");
    expect(formatServiceFeeRate(1000)).toBe("10%");
    expect(formatServiceFeeRate(1250)).toBe("12.5%");
    expect(formatServiceFeeRate(0)).toBe("0%");
  });
});

describe("serviceFeeLabel", () => {
  it("names the fee and the rate Operations set", () => {
    expect(serviceFeeLabel(300)).toBe("Service fee · 3%");
    expect(serviceFeeLabel(null)).toBe("Service fee");
  });
});

describe("showsServiceFee", () => {
  it("is true once GRIDGO has a rate or a snapshotted amount", () => {
    expect(showsServiceFee({ serviceFeeRateBps: 1000 })).toBe(true);
    expect(showsServiceFee({ serviceFeeMinor: 400 })).toBe(true);
    expect(showsServiceFee({})).toBe(false);
  });
});

describe("serviceFeeVisibleToClient", () => {
  it("hides only when Operations has turned the row off", () => {
    expect(serviceFeeVisibleToClient({ serviceFeeVisibleToClient: false })).toBe(false);
    expect(serviceFeeVisibleToClient({ serviceFeeVisibleToClient: true })).toBe(true);
    expect(serviceFeeVisibleToClient({})).toBe(true);
    expect(serviceFeeVisibleToClient(null)).toBe(true);
  });
});

describe("SERVICE_FEE_EXPLAINER", () => {
  it("says where the fee goes", () => {
    expect(SERVICE_FEE_EXPLAINER).toBe(
      "The fee directly goes into improving app operations and customer care.",
    );
  });
});
