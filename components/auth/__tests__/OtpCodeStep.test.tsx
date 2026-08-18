import { fireEvent, render, screen } from "@testing-library/react-native";

import { OtpCodeStep } from "@/components/auth/OtpCodeStep";

describe("OtpCodeStep", () => {
  it("is a six-digit autofill field, not a recovery-code form", async () => {
    const onChangeCode = jest.fn();
    await render(
      <OtpCodeStep
        heading="Enter the code"
        body="We sent a six-digit code to ana@company.com."
        code=""
        onChangeCode={onChangeCode}
        onSubmit={() => undefined}
        onResend={() => undefined}
        busy={false}
        submitLabel="Verify code"
      />,
    );

    const field = screen.getByLabelText("Verification code");
    expect(field.props.textContentType).toBe("oneTimeCode");
    expect(field.props.autoComplete).toBe("one-time-code");
    expect(field.props.maxLength).toBe(6);
    expect(field.props.keyboardType).toBe("number-pad");
    expect(screen.getByText("Enter the code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();
    expect(screen.queryByText("Recovery code")).toBeNull();
    expect(screen.queryByText("Check your email")).toBeNull();

    fireEvent.changeText(field, "12-34-56");
    expect(onChangeCode).toHaveBeenCalledWith("123456");
  });

  it("treats GRIDGO adopt as busy, not only Clerk fetching", async () => {
    await render(
      <OtpCodeStep
        heading="Enter the code"
        body="We sent a six-digit code to ana@company.com."
        code="123456"
        onChangeCode={() => undefined}
        onSubmit={() => undefined}
        busy
        submitLabel="Verify code"
      />,
    );

    expect(screen.getByRole("button", { name: "Checking…" })).toBeTruthy();
    expect(screen.getByLabelText("Verification code").props.editable).toBe(false);
  });
});
