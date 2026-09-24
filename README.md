# GRIDGO Client

The business-client app for GRIDGO, a Davao City managed-printing marketplace. It carries a print job from a structured request through artwork QA and proof approval to tracked delivery and the platform-configured issue window.

React Native, Expo Router, NativeWind. [package.json](package.json) owns the dependency versions.

## Where this sits

GRIDGO ships one app per role. This repo is the client app only.

| Surface | Repo | Notes |
|---|---|---|
| **Client mobile** | **this repo** | Request, artwork, proof, payment, tracking |
| Rider mobile | separate | Background location and navigation keep it out of this binary |
| Supplier mobile | separate | Time-sensitive actions only; the supplier portal is web |
| Supplier portal, Operations, Super Admin | separate | Next.js responsive web |

All apps share one Clerk application, so a person holding two roles keeps one account. A signed-in user whose role is not `client` is handed off to their own app rather than shown different navigation — there is no role switcher here.

Product requirements, the design system, and the operations model live in the `GRIDGO-TINKER` blueprint repo. `AGENTS.md` in this repo is the working source of truth for design tokens and conventions.

## Getting started

Use Node.js and Expo Go versions compatible with the SDK in `package.json`; see the [Expo SDK 57 requirements](https://docs.expo.dev/versions/v57.0.0/).

```bash
npm install
npm start
```

Day-to-day testing is **Expo Go** (`expo start --go --port 8081`). Open Expo Go on the phone, or press `w` / visit http://localhost:8081 for web.

`npm run android` still builds the USB development client when you need native FCM, lock-screen push, or `gridgoclient://` returns. Export `GOOGLE_SERVICES_JSON` to the captain's Firebase file for that path.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Metro for Expo Go (`expo start --go --port 8081`) |
| `npm run android` | Build and install the USB debug app (`expo run:android`) |
| `npm run ios` | Dev server targeting iOS |
| `npm run web` | Web target — useful for quick layout checks, not a shipping surface |
| `npm run lint` | ESLint via `expo lint` |
| `npm test` | Jest + `@testing-library/react-native` |
| `npm run test:watch` | Same, in watch mode |

Typecheck with `npx tsc --noEmit`. Strict mode is on and `any` is not allowed.

## Layout

```text
app/                 Routes and screens only — no reusable UI, no business logic
  (auth)/            Clerk-backed welcome, sign-in, and sign-up routes
  (tabs)/            Client tab shell: home, orders, new-request, notifications, account
  index.tsx          Launch-state mapping into auth, profile setup, or the app
  onboarding.tsx     Walkthrough available from Settings
  design-system.tsx  Living token and component reference
components/          Reusable UI
constants/           theme.ts (token mirror), fonts.ts, tabs.ts
hooks/               useTheme, useAppFonts
data/                Typed hardcoded content
store/               Zustand stores
lib/                 External service helpers
```

Clerk owns the identity session while `gridgo-api` owns the Client projection. A valid Client session enters Home after any required profile setup; accounts that cannot be adopted stay on sign-in with a clear recovery action.

`app/design-system.tsx` renders every colour token, type step, and base component in both themes. Open it when you need to check a token rather than reading the tables.

## The rules that matter most

Full detail is in `AGENTS.md`, which you should read before any feature. The three most easily broken:

- **Yellow is a finite attention budget.** `#FFDE58` marks one primary action per screen or bounded panel, plus the active stepper step, the selected nav item, and the map route. Navigation, secondary buttons, filters, and inputs stay black, white, or charcoal.
- **Colour never carries meaning alone.** Every status is icon + label + colour, so a screen stays readable in grayscale and to a screen reader.
- **No hard-coded hex values.** Style with NativeWind classes, which resolve per theme. `constants/theme.ts` exists for the places a class cannot reach — the navigation theme, the status bar, map styles.

Light and Dark are the same product with different presentation: identical labels, states, validation, and workflows. On Android pushed screens, including Sign in and New request, tap the title-row gear (**Choose theme**) to select System, Light, or Dark; theme selection is also available in Settings.

## Checkout and money

All amounts are PHP minor units — centavos, as integers. Nothing holds a peso float.

Payment uses QR Ph: a 75% downpayment and a 25% balance before delivery, checked by Operations. Cash on Delivery and Pilot Credits are unavailable.

At checkout, add the QR transfer screenshot. GRIDGO reads its payment reference automatically; wait for reading to finish, then check or enter the reference yourself if it could not be read. You can view, replace or remove the screenshot. The receipt and reference survive a trip to the address screen within the same app session. The pinned footer shows the total; tapping **Place order** points out missing fields. A submitted receipt awaits Operations' confirmation.

For delivery without an address, checkout can fill a saved address. Check it and use **Change** if needed. If a listing refresh removes an option you selected, choose a current option or tap **Remove unavailable selection**; required groups still need a choice.

## Updates and notifications

Open screens refresh when GRIDGO reports relevant changes and reconcile after reconnecting or returning to the foreground. Order cards and details include the order ID. Push taps wait for sign-in and navigation readiness, then open an accessible order or the Notifications inbox. Foreground updates work independently of push permission; see [Live resource updates](docs/REALTIME_UPDATES.md) for implementation guidance.

## App updates

A release APK looks for a newer GitHub Release on launch and on return to the foreground (at most every four hours) and offers the landing site's APK. **Later** quiets that version until the next day. The first launch of a newer build confirms the update. Expo Go and development builds skip the check; to see the prompt there, pretend to be an older build:

```bash
EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE=1 npm start -- --clear
```

Restart with a later number (for example the current release's) to see "Update completed". `--clear` matters: the value is inlined at bundle time, and Metro's cache would keep the old one.

## Android emulator API URL

From the **Android emulator**, `127.0.0.1` is the emulator itself. Use:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm start
```

Physical device / Expo Go on phone: use the host LAN IP (e.g. `http://192.168.1.55:8787`).
