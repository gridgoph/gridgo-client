import { signInAsync } from "expo-apple-authentication";

/**
 * Ask Apple for a fresh authorization code (iPhone only).
 *
 * This is Apple's own sheet straight from `expo-apple-authentication`, not
 * Clerk's Apple flow, so the signed-in Clerk identity is left exactly as it
 * is. No scopes: only the code is needed. The code is single use and short
 * lived; the caller holds it in memory and never logs or stores it.
 *
 * Throws Apple's `ERR_REQUEST_CANCELED` when the person closes the sheet.
 */
export async function appleAuthorizationCode(): Promise<string | null> {
  const credential = await signInAsync();
  return credential.authorizationCode ?? null;
}
