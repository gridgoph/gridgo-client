# Clerk authentication design

## Goal

Replace the client app's public authentication UI with the approved GRIDGO welcome, sign-in, and sign-up layouts while keeping the domain API as the source of client-role truth. Clerk owns identity and session persistence. Only this client binary exposes self sign-up.

## Experience

- Launch signed out into a welcome screen with the supplied greeting illustration, plain GRIDGO identity, one yellow **Sign Up** action, and a quiet **Already have an account** action.
- Sign in with email/password or the Clerk-configured Google connection. Password recovery stays in the sign-in route and advances through email-code and new-password states.
- Sign up with full name, email, password, and confirmation. Clerk's required email verification stays in the sign-up route so the public flow remains three screens.
- Use Satoshi, the existing semantic theme tokens, the GRIDGO yellow action rule, `FormScreen`, and current field/button primitives in both light and dark themes.
- Show password visibility controls, accessible labels, useful inline errors, loading labels, and 44dp touch targets.
- Do not show Facebook because the Clerk instance does not enable it.

## Session boundary

`ClerkProvider` uses Clerk's Expo SecureStore token cache. A root bridge exposes Clerk's asynchronous `getToken()` to `lib/api.ts`; every domain request sends that token as its Bearer credential. After Clerk becomes active, the bridge calls `/me`, accepts only the `client` role, and places the API's projected user in the existing Zustand session so the current `Stack.Protected` navigation stays authoritative.

The Clerk publishable key is read from `expo-constants` through `app.config.ts` `extra`, with the source value supplied at build time by `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. A missing key fails early with a configuration message. No secret key belongs in the client bundle or repository.

For local development only, sign-in exposes a **Use local API instead** path. It submits the same empty-by-default fields to the legacy endpoint, preserving `tok_*` sessions while a local API deployment has not learned to verify Clerk JWTs. Legacy bearer memory takes precedence over the Clerk token provider until that session ends.

## Navigation and recovery

The signed-out stack owns `welcome`, `login`, and `signup`. Welcome has no header. Sign-in and sign-up draw their own mockup-style back control and keep the native header hidden. Session clearing remains the only action needed to leave protected routes; no feature screen redirects itself.

Clerk sign-out is registered behind the existing Zustand `logout()` action so the Account screen and API 401 behavior continue to have one exit boundary. Domain role mismatch signs out Clerk and explains which role-specific app the account belongs to.

## Validation

Pin pure name/error helpers, app config output, asynchronous token resolution, session adoption, route coverage, and the public auth layouts in Jest. Then run typecheck, Expo lint, the complete test suite, Android and iOS static exports, `clerk doctor`, and browser visual comparison against the supplied mockup.
