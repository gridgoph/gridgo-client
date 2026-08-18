import { normalizeOtp, otpReady } from "@/lib/otp";

describe("normalizeOtp", () => {
  it("keeps the first six digits and drops everything else", () => {
    expect(normalizeOtp("12-34 56")).toBe("123456");
    expect(normalizeOtp("1234567890")).toBe("123456");
    expect(normalizeOtp("12ab34")).toBe("1234");
  });
});

describe("otpReady", () => {
  it("is ready only on a full six-digit code", () => {
    expect(otpReady("12345")).toBe(false);
    expect(otpReady("123456")).toBe(true);
    expect(otpReady("12-34-56")).toBe(true);
  });
});
