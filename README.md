# GRIDGO Client

The business-client app for GRIDGO, a Davao City managed-printing marketplace. It carries a print job from a structured request through artwork QA and proof approval to tracked delivery and the 24-hour issue window.

React Native, Expo SDK 54, Expo Router, NativeWind.

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

```bash
npm install
npx expo start --dev-client
```

Android day-to-day is a USB development build (`expo-dev-client`), not Expo Go. Install once with `npx expo run:android` (export `GOOGLE_SERVICES_JSON` to the captain's Firebase file so push is wired). Then the installed `ph.gridgo.client` app talks to Metro.

**Expo Go is not sufficient.** Native FCM tokens, lock-screen push, and `gridgoclient://` returns need this app's own debug build. Expo Go Android SDK 53 throws if `expo-notifications` is imported.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Metro for the development client (`expo start --dev-client`) |
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
  index.tsx          Launch-state mapping into auth, profile setup, onboarding, or the app
  onboarding.tsx     First-run walkthrough
  design-system.tsx  Living token and component reference
components/          Reusable UI
constants/           theme.ts (token mirror), fonts.ts, tabs.ts
hooks/               useTheme, useAppFonts
data/                Typed hardcoded content
store/               Zustand stores
lib/                 External service helpers
```

Clerk owns the identity session while `gridgo-api` owns the Client projection. A valid Client session enters the app after any required profile setup or first-run onboarding; accounts that cannot be adopted stay on sign-in with a clear recovery action.

`app/design-system.tsx` renders every colour token, type step, and base component in both themes. Open it when you need to check a token rather than reading the tables.

## The rules that matter most

Full detail is in `AGENTS.md`, which you should read before any feature. The three most easily broken:

- **Yellow is a finite attention budget.** `#FFDE58` marks one primary action per screen or bounded panel, plus the active stepper step, the selected nav item, and the map route. Navigation, secondary buttons, filters, and inputs stay black, white, or charcoal.
- **Colour never carries meaning alone.** Every status is icon + label + colour, so a screen stays readable in grayscale and to a screen reader.
- **No hard-coded hex values.** Style with NativeWind classes, which resolve per theme. `constants/theme.ts` exists for the places a class cannot reach — the navigation theme, the status bar, map styles.

Light and Dark are the same product with different presentation: identical labels, states, validation, and workflows.

## Money

All amounts are PHP minor units — centavos, as integers. Nothing holds a peso float.

Pilot payment is Pilot Credits or eligible Cash on Delivery. COD requires a final total of ₱1,500 or less. Pilot Credits are a non-cash test instrument: the UI never says "Top Up", "Cash Out", or "Transfer", and exposes no purchase, withdrawal, or transfer control.

## Android emulator API URL

From the **Android emulator**, `127.0.0.1` is the emulator itself. Use:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm start
```

Physical device / Expo Go on phone: use the host LAN IP (e.g. `http://192.168.1.55:8787`).
