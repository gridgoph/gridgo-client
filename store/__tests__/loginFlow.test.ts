import { useLoginFlow } from "@/store/loginFlow";

describe("useLoginFlow", () => {
  beforeEach(() => {
    useLoginFlow.getState().reset();
  });

  it("keeps MFA verification off the recovery-code step", () => {
    useLoginFlow.getState().enterVerification("email_code");
    expect(useLoginFlow.getState().step).toBe("verifyCode");
    expect(useLoginFlow.getState().codePurpose).toBe("verify");
  });

  it("keeps password recovery on its own step", () => {
    useLoginFlow.getState().enterRecovery();
    expect(useLoginFlow.getState().step).toBe("recoveryCode");
    expect(useLoginFlow.getState().codePurpose).toBe("reset");
  });
});
