import {
  ACCOUNT_TYPES,
  canSubmitSignup,
  checkSignupField,
  EMPTY_SIGNUP,
  firstSignupProblem,
  needsOrgName,
  signupInput,
  type SignupFields,
} from "@/lib/signup";

function fields(overrides: Partial<SignupFields> = {}): SignupFields {
  return {
    ...EMPTY_SIGNUP,
    name: "Ana Santos",
    email: "ana@company.com",
    phone: "0917 123 4567",
    password: "printit2026",
    ...overrides,
  };
}

describe("account types", () => {
  it("offers the three the API stores", () => {
    expect(ACCOUNT_TYPES.map((option) => option.value)).toEqual([
      "individual",
      "business",
      "organization",
    ]);
  });

  it("calls the individual account what the captain calls it", () => {
    // The API stores `individual` and accepts `personal` as an input alias;
    // the person filling the form thinks "personal".
    expect(ACCOUNT_TYPES[0].label).toBe("Personal");
    expect(ACCOUNT_TYPES[0].value).toBe("individual");
  });

  it("asks for a name only where the API requires one", () => {
    expect(needsOrgName("individual")).toBe(false);
    expect(needsOrgName("business")).toBe(true);
    expect(needsOrgName("organization")).toBe(true);
  });
});

describe("checkSignupField", () => {
  it("passes a complete personal account", () => {
    expect(canSubmitSignup(fields())).toBe(true);
  });

  it("requires the organization name for a business, and not otherwise", () => {
    expect(canSubmitSignup(fields({ accountType: "business" }))).toBe(false);
    expect(
      canSubmitSignup(fields({ accountType: "business", orgName: "Davao Events Co." })),
    ).toBe(true);
    expect(canSubmitSignup(fields({ accountType: "organization" }))).toBe(false);
    // An organization name typed then switched to personal never blocks.
    expect(canSubmitSignup(fields({ accountType: "individual", orgName: "" }))).toBe(true);
  });

  it("holds the API's own password floor rather than discovering it on submit", () => {
    expect(checkSignupField("password", fields({ password: "short" })).ok).toBe(false);
    expect(checkSignupField("password", fields({ password: "12345678" })).ok).toBe(true);
  });

  it("accepts every address the API would, and no fewer", () => {
    expect(checkSignupField("email", fields({ email: "ana+jobs@sub.company.ph" })).ok).toBe(true);
    expect(checkSignupField("email", fields({ email: "ana" })).ok).toBe(false);
    expect(checkSignupField("email", fields({ email: "ana@company" })).ok).toBe(false);
  });

  it("explains the fix and never returns a code", () => {
    const problems = [
      checkSignupField("name", fields({ name: " " })).reason,
      checkSignupField("email", fields({ email: "" })).reason,
      checkSignupField("phone", fields({ phone: "" })).reason,
      checkSignupField("password", fields({ password: "" })).reason,
      checkSignupField("orgName", fields({ accountType: "business" })).reason,
    ];
    for (const reason of problems) {
      expect(reason).toBeTruthy();
      expect(reason).not.toMatch(/^[a-z_]+$/);
      expect(reason).not.toMatch(/[a-z]+_[a-z]+/);
    }
  });
});

describe("firstSignupProblem", () => {
  it("names one thing at a time, from the top of the form", () => {
    expect(firstSignupProblem(fields({ name: "", email: "" }))).toMatch(/name/i);
    expect(firstSignupProblem(fields({ email: "" }))).toMatch(/email/i);
    expect(firstSignupProblem(fields())).toBeNull();
  });
});

describe("signupInput", () => {
  it("sends exactly what POST /auth/signup wants", () => {
    expect(
      signupInput(fields({ accountType: "business", orgName: "  Davao Events Co. " })),
    ).toEqual({
      email: "ana@company.com",
      password: "printit2026",
      name: "Ana Santos",
      phone: "0917 123 4567",
      accountType: "business",
      orgName: "Davao Events Co.",
    });
  });

  it("normalises the email the way the API stores it", () => {
    expect(signupInput(fields({ email: "  Ana@Company.COM " })).email).toBe("ana@company.com");
  });

  it("omits the organization name a personal account has no use for", () => {
    const input = signupInput(fields({ accountType: "individual", orgName: "Leftover Co." }));
    expect(input).not.toHaveProperty("orgName");
  });
});
