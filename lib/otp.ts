/** Email / MFA codes are six digits. Recovery stays a different field. */
export const OTP_LENGTH = 6;

/** Keep only the digits the boxes can show. */
export function normalizeOtp(value: string, length = OTP_LENGTH): string {
  return value.replace(/\D/g, "").slice(0, length);
}

export function otpReady(value: string, length = OTP_LENGTH): boolean {
  return normalizeOtp(value, length).length === length;
}
