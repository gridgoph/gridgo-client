import { reconcileTheme } from "@/lib/themeSync";

describe("reconcileTheme", () => {
  it("applies the account's choice", () => {
    expect(reconcileTheme({ preference: "light", unsynced: false, owner: "u1" }, "u1", "dark")).toEqual({ apply: "dark", push: null });
  });

  it("changes nothing when phone and account agree", () => {
    expect(reconcileTheme({ preference: "dark", unsynced: false, owner: "u1" }, "u1", "dark")).toEqual({ apply: null, push: null });
  });

  it("re-sends a tap the account has not stored yet", () => {
    expect(reconcileTheme({ preference: "dark", unsynced: true, owner: "u1" }, "u1", "system")).toEqual({ apply: null, push: "dark" });
  });

  it("does not carry another account's unsaved tap over", () => {
    expect(reconcileTheme({ preference: "dark", unsynced: true, owner: "u2" }, "u1", "light")).toEqual({ apply: "light", push: null });
  });

  it("keeps a choice made on this phone the first time it meets an account that follows the phone", () => {
    expect(reconcileTheme({ preference: "dark", unsynced: false, owner: null }, "u1", "system")).toEqual({ apply: null, push: "dark" });
  });

  it("keeps what is shown when the account could not be read", () => {
    expect(reconcileTheme({ preference: "dark", unsynced: false, owner: "u1" }, "u1", null)).toEqual({ apply: null, push: null });
  });
});
