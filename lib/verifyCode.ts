import type { ClerkSecondFactorStrategy } from "@/lib/clerkSignIn";

export type VerifyCodeCopy = {
  heading: string;
  body: string;
  /** TOTP and backup codes are not mailed, so there is nothing to resend. */
  resend: boolean;
};

/**
 * Login MFA / new-device trust — never the password-recovery surface.
 */
export function loginVerifyCopy(
  factor: ClerkSecondFactorStrategy,
  email: string,
): VerifyCodeCopy {
  if (factor === "phone_code") {
    return {
      heading: "Enter the code",
      body: "We sent a six-digit code to your phone.",
      resend: true,
    };
  }
  if (factor === "totp") {
    return {
      heading: "Enter the code",
      body: "Enter the six-digit code from your authenticator app.",
      resend: false,
    };
  }
  if (factor === "backup_code") {
    return {
      heading: "Enter a backup code",
      body: "Use one of the backup codes you saved when you set up two-factor authentication.",
      resend: false,
    };
  }
  const destination = email.trim();
  return {
    heading: "Enter the code",
    body: destination
      ? `We sent a six-digit code to ${destination}.`
      : "We sent a six-digit code to your email.",
    resend: true,
  };
}

export function signupVerifyCopy(email: string): VerifyCodeCopy {
  const destination = email.trim();
  return {
    heading: "Verify your email",
    body: destination
      ? `Enter the six-digit code sent to ${destination}.`
      : "Enter the six-digit code sent to your email.",
    resend: true,
  };
}
