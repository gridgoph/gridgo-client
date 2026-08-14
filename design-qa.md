# Authentication design QA

Status: implementation review passed; native visual inspection is a device follow-up and is not a merge gate for this change.

## Reference coverage

- Welcome: supplied greeting illustration, centered welcome copy, yellow Sign Up action, and secondary existing-account action.
- Sign in: own back control, Welcome Back heading, email/password fields, accessible password visibility, recovery flow, yellow primary action, divider, Google connection, and sign-up link. No unavailable social provider is shown.
- Sign up: own back control, Create Account heading, full name/email/password/confirmation, yellow primary action, and inline email-code verification.
- GRIDGO system: Satoshi type, semantic light/dark tokens, existing 44dp controls, `FormScreen`, and the single-yellow-action rule.

## Functional review

- Public routes are protected away after the domain client projection loads.
- Clerk password sign-in/sign-up, Google SSO, email verification, and password recovery are wired through custom flows.
- Clerk sessions use Expo SecureStore and provide fresh Bearer tokens to `gridgo-api`.
- The development-only local API fallback preserves legacy `tok_*` sessions without prefilled credentials.
- Clerk and domain sign-out share the existing session boundary.

## Device follow-up

Open the three routes in Expo Go or an installed development build on representative iOS and Android phones. Compare against `login-reference.png` for illustration crop, keyboard reachability, safe-area spacing, and dark-theme contrast. Expo web is intentionally not used as the visual acceptance environment for these native screens.
