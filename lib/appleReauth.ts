/**
 * Sign in with Apple exists on iPhone only, so Android and the web have no
 * code to give. `appleReauth.ios.ts` is the iPhone version; keeping it in its
 * own file keeps `expo-apple-authentication` out of every other bundle, the
 * same split as `components/auth/AppleButton.tsx`.
 */
export async function appleAuthorizationCode(): Promise<string | null> {
  return null;
}
