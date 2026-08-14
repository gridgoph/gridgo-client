# Clerk authentication implementation plan

1. Add configuration tests for the Clerk key in Expo `extra` and the SecureStore/Clerk plugins. Add `expo-secure-store` and keep `.env.local` ignored.
2. Add pure Clerk auth helpers with tests for full-name splitting, password confirmation, and user-facing Clerk errors.
3. Extend `lib/api.ts` with a tested async token provider while preserving legacy in-memory token precedence and upload authorization.
4. Extend the Zustand session with Clerk adoption/source state and a registered identity sign-out callback. Add a root hook that bridges `useAuth().getToken`, calls `/me`, enforces the client role, and releases Clerk on sign-out or rejection.
5. Copy the supplied greeting SVG into `assets/illustrations/`. Add small auth-specific primitives for a password visibility field, back action, divider, and Google action using the existing design system.
6. Add the welcome route and rebuild sign-in/sign-up as custom Clerk flows. Cover email verification, password recovery, Google SSO, validation, errors, and the development-only local API fallback.
7. Update root navigation/index mapping and authentication tests. Run the focused tests after each behavior, then run typecheck, lint, and the full suite.
8. Start Expo web, exercise the three-screen journey, capture implementation screenshots, compare them side by side with the reference, fix visible gaps, and record the result in `design-qa.md`.
9. Export Android and iOS bundles, run `clerk doctor`, verify no secret or live key is tracked, update durable project guidance, commit, push `fm/gridgo-client-clerk`, and open the direct PR with `gh-axi`.
