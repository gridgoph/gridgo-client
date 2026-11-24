"use no memo";

import { useAuth, useClerk } from "@clerk/expo";

import { clerkOffersFacebook, facebookPreviewForced } from "@/lib/socialSignIn";

/**
 * Whether "Continue with Facebook" is drawn: only while the Clerk instance
 * offers the Facebook connection (`lib/socialSignIn.ts`).
 *
 * Opted out of the React Compiler: the answer lives on Clerk's environment
 * object, which Clerk fills in place, so a memo keyed on the `clerk` handle
 * could keep "not offered" after the environment has arrived.
 */
export function useFacebookOffered(): boolean {
  const clerk = useClerk();
  const { isLoaded } = useAuth();
  // A literal read so Babel inlines it; a release build never honours it.
  if (facebookPreviewForced(__DEV__, process.env.EXPO_PUBLIC_SHOW_FACEBOOK_SIGN_IN)) return true;
  return Boolean(isLoaded) && clerkOffersFacebook(clerk);
}
