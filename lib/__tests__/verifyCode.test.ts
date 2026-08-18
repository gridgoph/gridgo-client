import { loginVerifyCopy, signupVerifyCopy } from "@/lib/verifyCode";

describe("loginVerifyCopy", () => {
  it("is an emailed OTP, never the recovery surface", () => {
    const copy = loginVerifyCopy("email_code", "ana@company.com");
    expect(copy.heading).toBe("Enter the code");
    expect(copy.body).toContain("ana@company.com");
    expect(copy.resend).toBe(true);
    expect(JSON.stringify(copy)).not.toMatch(/recovery/i);
  });

  it("hides resend when Clerk did not mail a code", () => {
    expect(loginVerifyCopy("totp", "").resend).toBe(false);
    expect(loginVerifyCopy("backup_code", "").resend).toBe(false);
  });
});

describe("signupVerifyCopy", () => {
  it("names email verification, not password recovery", () => {
    const copy = signupVerifyCopy("ana@company.com");
    expect(copy.heading).toBe("Verify your email");
    expect(copy.body).toContain("ana@company.com");
    expect(JSON.stringify(copy)).not.toMatch(/recovery/i);
  });
});
