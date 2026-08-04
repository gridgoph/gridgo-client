# GRIDGO Polyrepo Workspace Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure GRIDGO into a `mobile/` + `web/` + `shared/` polyrepo workspace, extract the code that must never drift between roles into a versioned `@gridgo/core` package, and prove the structure by standing up `gridgo-rider` as a second consumer.

**Architecture:** Each app is an independent git repo. `mobile/` and `web/` are plain filesystem directories, not repos. Cross-repo sharing works two ways, chosen by risk: **logic that must match exactly** (order state machine, money, tokens) ships as a versioned npm package installed from a git tag; **design-system files that Metro and NativeWind resolve awkwardly from `node_modules`** (`global.css`, font binaries, base components) are copied into each app by a sync script, with a CI check that fails on drift. Copying sidesteps NativeWind v5-preview module resolution entirely while still giving a single source of truth.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19.1, Expo Router 6, NativeWind 5.0.0-preview.4, Tailwind 4, TypeScript 5.9 strict, Jest + @testing-library/react-native 14 (apps), Vitest (shared package), Zustand, Next.js (web, later plan).

## Global Constraints

- Read the exact versioned Expo docs at `https://docs.expo.dev/versions/v54.0.0/` before writing any Expo code. Expo has changed.
- Do not introduce new major libraries without approval (`AGENTS.md` § Decision Making). This plan adds exactly one: Vitest, and only inside `gridgo-core`, which is not an app.
- Do not upgrade NativeWind, Expo, or React Native as part of this work.
- TypeScript strict mode. No `any`.
- All money is stored and passed as PHP minor units (centavos). `GRIDGO_Product_Requirements_Document.md:131`.
- COD ceiling is a final total of **₱1,500 inclusive** = `150000` minor units. `₱1,501` rejects. `GRIDGO_Product_Requirements_Document.md:87-88`.
- Every role shows **identical workflow and state labels**. `GRIDGO_Design_Requirements_Document.md:126`. This is the requirement `@gridgo/core` exists to guarantee.
- Colour never carries meaning alone — status is always icon + label + colour. `AGENTS.md` § Status.
- `actionYellow` is one primary CTA per screen or bounded panel. `AGENTS.md` § The yellow rule.
- Bundle identifiers and Expo slugs are permanent once published to a store. They are set in Task 1 and never changed after.
- Do not use `Intl.NumberFormat` for currency in shared code — Hermes ICU coverage differs across platforms. Format manually.
- Order states in scope are the happy path in `GRIDGO_Product_Requirements_Document.md:25-31` plus `cancelled` and `delivery_failed`. The remaining exception paths listed at `GRIDGO_Product_Requirements_Document.md:43` (dispute, refund, adjustment, reprint, collected-by-customer, payout hold) arrive in a later plan once the Operations flows are specified.

---

## Target Workspace Layout

```text
~/personal/projects/mobile/gridgo/
  GRIDGO-TINKER/              existing docs repo — unchanged by this plan
  mobile/
    gridgo-client/            git repo — moved from gridgo-app/gridgo-mobile
    gridgo-rider/             git repo — created in Task 7
    gridgo-supplier/          git repo — later plan
  web/
    gridgo-portal/            git repo — later plan (supplier portal + Ops + Super Admin)
  shared/
    gridgo-core/              git repo — created in Task 2
```

`mobile/`, `web/`, and `shared/` are ordinary directories. Nothing tracks them. Each leaf is its own repo with its own remote.

## File Structure

**`shared/gridgo-core`** — published as `@gridgo/core`, installed from a git tag. Zero runtime dependencies so it drops into React Native and Next.js alike.

| Path | Responsibility |
|---|---|
| `src/order-state.ts` | The order state machine: states, legal transitions, one label per state, one status tone per state |
| `src/money.ts` | PHP minor-unit formatting and the COD eligibility ceiling |
| `src/tokens.ts` | Colour, type, spacing, radius, motion token **values** as platform-neutral data |
| `src/index.ts` | Re-exports the three modules; the only public entry point |
| `design/global.css` | Canonical NativeWind/Tailwind layer — synced, not imported |
| `design/fonts/` | Satoshi cuts + licence — synced, not imported |
| `design/components/` | Base UI primitives shared by all three mobile apps — synced, not imported |
| `design/hooks/useTheme.ts` | Theme resolution used by the synced components — synced, not imported |
| `design/manifest.json` | The list of synced paths; the sync script and drift check both read it |

**`mobile/gridgo-client`** — the existing app, renamed. Changes are confined to identifiers, `AGENTS.md` scoping, and swapping locally-defined tokens for `@gridgo/core`.

| Path | Change |
|---|---|
| `app.json` | Name, slug, scheme, `ios.bundleIdentifier`, `android.package` |
| `package.json` | Package name, `@gridgo/core` dependency, sync scripts |
| `constants/theme.ts` | Becomes a thin re-export of `@gridgo/core` tokens plus RN-only `elevation` |
| `constants/fonts.ts` | Stays local — it holds `require()` calls Metro must resolve in-app |
| `scripts/sync-design.mjs` | Copies `@gridgo/core/design` into place; `--check` mode diffs instead |
| `.github/workflows/ci.yml` | Lint, typecheck, test, design drift check |
| `AGENTS.md` | Scoped to the Client role only |

**`mobile/gridgo-rider`** — new, created from the same design system so it starts consistent rather than converging later.

---

### Task 1: Restructure the workspace and rename the client app

The move and the rename are one task: a repo named `gridgo-mobile` sitting in `mobile/` is more confusing than either problem alone, and both are cheap now at 16 commits and impossible later once a store listing exists.

**Files:**
- Move: `gridgo-app/gridgo-mobile/` → `mobile/gridgo-client/`
- Modify: `mobile/gridgo-client/package.json:2`
- Modify: `mobile/gridgo-client/app.json:3-9`
- Modify: `mobile/gridgo-client/AGENTS.md:11-46`
- Delete: `gridgo-app/` (empty after the move)

**Interfaces:**
- Consumes: nothing.
- Produces: the workspace paths every later task refers to. After this task, `WORKSPACE=~/personal/projects/mobile/gridgo` and the client app lives at `$WORKSPACE/mobile/gridgo-client`.

- [ ] **Step 1: Land the work in progress**

Three files are currently modified. Commit them before moving anything, so a failed move is recoverable with `git checkout`.

```bash
cd ~/personal/projects/mobile/gridgo/gridgo-app/gridgo-mobile
git status --short
git add -A
git commit -m "chore: land work in progress before the workspace restructure"
```

- [ ] **Step 2: Move the repo into the new layout**

```bash
cd ~/personal/projects/mobile/gridgo
mkdir -p mobile web shared
mv gridgo-app/gridgo-mobile mobile/gridgo-client
rmdir gridgo-app
ls mobile web shared
```

Expected: `mobile` contains `gridgo-client`; `web` and `shared` are empty.

- [ ] **Step 3: Rename the GitHub repo and update the remote**

```bash
cd ~/personal/projects/mobile/gridgo/mobile/gridgo-client
gh repo rename gridgo-client --repo rqms40/gridgo-mobile
git remote set-url origin git@github.com:rqms40/gridgo-client.git
git remote -v
```

Expected: both fetch and push read `git@github.com:rqms40/gridgo-client.git`. GitHub redirects the old name, so any stale clone keeps working.

- [ ] **Step 4: Set the permanent identifiers**

In `app.json`, replace the opening of the `expo` block and add the two identifier fields. These can never change after a store submission.

```json
{
  "expo": {
    "name": "GRIDGO",
    "slug": "gridgo-client",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "gridgoclient",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "ph.gridgo.client"
    },
    "android": {
      "package": "ph.gridgo.client",
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false
    },
```

Leave `web`, `plugins`, and `experiments` exactly as they are.

In `package.json`, line 2:

```json
  "name": "gridgo-client",
```

- [ ] **Step 5: Scope AGENTS.md to the Client role**

`AGENTS.md` currently describes Client, Rider, and Supplier as one app, and its Cross-cutting section says "a signed-in user sees only their role's navigation and screens." That describes the architecture we are moving away from.

Replace the `## Project Overview` section — from the line `We are building GRIDGO, the mobile app for a Davao City managed-printing marketplace` through the end of the `**Cross-cutting**` list — with:

```markdown
## Project Overview

This repo is **GRIDGO Client** — the business-client app for a Davao City
managed-printing marketplace. It carries a print job from structured request
through artwork QA and proof approval to tracked delivery and the 24-hour
issue window.

GRIDGO ships one app per role. The Rider app lives in `gridgo-rider`, the
Supplier app in `gridgo-supplier`, and the Supplier Operations Admin and
Super Admin portals in `gridgo-portal`. Nothing role-specific to another app
belongs here. Anything all three mobile apps must agree on — order states and
their labels, money handling, design tokens — lives in `@gridgo/core` and is
never redefined locally.

This app includes:

- Product catalog with frequently-reordered items and one-tap reorder.
- Structured print request: a 4-step stepper (Details → Artwork → Review →
  Confirm) capturing product, size, material, quantity, deadline, and
  delivery address.
- Artwork upload, QA correction loop, and proof approval (Approve & Continue /
  Request Changes) against a preflight checklist.
- Product Preview: artwork composited into a Flyer, Tarpaulin, Signage, or
  T-shirt template, always labeled "Visual mockup — not print-ready proof."
- Payment selection limited to Pilot Credits or eligible Cash on Delivery.
- Active delivery tracking: map with route, ETA, rider card, and an honest
  last-updated/stale-location state.
- Order history and reporting a material issue inside the 24-hour issue window.

**Cross-cutting**

- Auth. A signed-in user who is not a client is told which app to use and
  deep-linked to it, rather than being shown a different role's navigation.
- Light and Dark themes with identical labels, states, and workflows.
- Push/in-app notifications for SLA deadlines and state changes.
```

- [ ] **Step 6: Verify nothing broke**

```bash
cd ~/personal/projects/mobile/gridgo/mobile/gridgo-client
rm -rf .expo
npx tsc --noEmit
npm run lint
npm test
```

Expected: typecheck clean, lint clean, all existing tests pass. Deleting `.expo` clears the cached slug from the old app name.

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "chore: rename to gridgo-client and set permanent identifiers"
git push -u origin dev
```

---

### Task 2: Create gridgo-core with the order state machine

The state machine is the one piece where cross-app drift is a correctness bug rather than a cosmetic one — `GRIDGO_Design_Requirements_Document.md:126` requires identical state labels across roles, and three independently-released binaries cannot honour that by discipline.

**Files:**
- Create: `shared/gridgo-core/package.json`
- Create: `shared/gridgo-core/tsconfig.json`
- Create: `shared/gridgo-core/.gitignore`
- Create: `shared/gridgo-core/src/order-state.ts`
- Create: `shared/gridgo-core/src/index.ts`
- Test: `shared/gridgo-core/src/order-state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type OrderState` — union of the 22 state ids
  - `type StatusTone = "success" | "warning" | "error" | "info" | "neutral"`
  - `const ORDER_STATES: readonly OrderState[]`
  - `const ORDER_STATE_LABEL: Record<OrderState, string>`
  - `const ORDER_STATE_TONE: Record<OrderState, StatusTone>`
  - `function canTransition(from: OrderState, to: OrderState): boolean`
  - `function nextStates(from: OrderState): readonly OrderState[]`

- [ ] **Step 1: Scaffold the package**

```bash
cd ~/personal/projects/mobile/gridgo/shared
mkdir -p gridgo-core/src
cd gridgo-core
git init -b dev
```

`package.json`:

```json
{
  "name": "@gridgo/core",
  "version": "0.0.0",
  "description": "Shared GRIDGO contracts: order states, money, design tokens.",
  "license": "UNLICENSED",
  "private": false,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "design"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./design/*": "./design/*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepare": "npm run build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "~5.9.2",
    "vitest": "^3.0.0"
  }
}
```

`prepare` is what makes a git-tag install work: npm runs it automatically after cloning the dependency, so consumers get a built `dist/` without a registry.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2020"],
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

CommonJS output because Metro resolves `main` reliably; Next.js consumes it fine either way.

`.gitignore`:

```gitignore
node_modules/
dist/
```

```bash
npm install
```

- [ ] **Step 2: Write the failing test**

`src/order-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ORDER_STATES,
  ORDER_STATE_LABEL,
  ORDER_STATE_TONE,
  canTransition,
  nextStates,
  type OrderState,
} from "./order-state";

describe("order states", () => {
  it("covers the PRD happy path in order", () => {
    const happyPath: OrderState[] = [
      "draft",
      "submitted",
      "needs_qa",
      "approved_for_matching",
      "supplier_assigned",
      "supplier_accepted",
      "awaiting_payment",
      "payment_authorized",
      "production",
      "supplier_self_qc",
      "ready_for_dispatch",
      "rider_assigned",
      "picked_up",
      "out_for_delivery",
      "delivered",
      "issue_window_open",
      "completed",
      "payout_released",
    ];

    for (let i = 0; i < happyPath.length - 1; i++) {
      const from = happyPath[i]!;
      const to = happyPath[i + 1]!;
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("gives every state a label and a tone", () => {
    for (const state of ORDER_STATES) {
      expect(ORDER_STATE_LABEL[state], state).toBeTruthy();
      expect(ORDER_STATE_TONE[state], state).toBeTruthy();
    }
  });

  it("states what happened, never a bare status code", () => {
    expect(ORDER_STATE_LABEL.needs_qa).toBe("In review");
    expect(ORDER_STATE_LABEL.client_correction).toBe("Needs correction");
    expect(ORDER_STATE_LABEL.payout_released).toBe("Payout released");
  });

  it("refuses a jump past the QA gate", () => {
    expect(canTransition("submitted", "approved_for_matching")).toBe(false);
    expect(canTransition("draft", "production")).toBe(false);
  });

  it("refuses production before payment authorization", () => {
    expect(canTransition("awaiting_payment", "production")).toBe(false);
    expect(canTransition("payment_authorized", "production")).toBe(true);
  });

  it("returns a supplier decline and a payment expiry to matching", () => {
    expect(canTransition("supplier_assigned", "approved_for_matching")).toBe(true);
    expect(canTransition("awaiting_payment", "approved_for_matching")).toBe(true);
  });

  it("sends a failed delivery back for redelivery, not to delivered", () => {
    expect(canTransition("out_for_delivery", "delivery_failed")).toBe(true);
    expect(canTransition("delivery_failed", "rider_assigned")).toBe(true);
    expect(canTransition("delivery_failed", "delivered")).toBe(false);
  });

  it("ends at payout_released and cancelled", () => {
    expect(nextStates("payout_released")).toEqual([]);
    expect(nextStates("cancelled")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./order-state"`.

- [ ] **Step 4: Write the implementation**

`src/order-state.ts`:

```ts
/**
 * The GRIDGO order state machine.
 *
 * Every role renders these states, and every role must render them with the
 * same words — see the acceptance criterion in the Design Requirements
 * Document ("identical workflow/state labels"). Three separately-released
 * apps cannot honour that by convention, so the labels live here and each app
 * reads them rather than writing its own.
 *
 * This is a display and validation aid, not the authority. Postgres RLS and
 * the Edge Functions decide what a transition is actually allowed to do; this
 * lets a screen grey out a control before the server refuses it.
 *
 * Source: GRIDGO Product Requirements Document, section 3.
 */

/** Semantic tone. Always paired with an icon and a label — never colour alone. */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

export const ORDER_STATES = [
  "draft",
  "submitted",
  "needs_qa",
  "client_correction",
  "proof_approval",
  "approved_for_matching",
  "supplier_assigned",
  "supplier_accepted",
  "awaiting_payment",
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "delivery_failed",
  "issue_window_open",
  "completed",
  "payout_released",
  "cancelled",
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

/**
 * One label per state, shared by every role.
 *
 * Written for the person reading the screen, not for the engineer reading the
 * enum: a client seeing "In review" understands it, where "needs_qa" leaks the
 * schema. Changing a string here changes it in all three apps at once, which
 * is the entire point of this file.
 */
export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  draft: "Draft",
  submitted: "Submitted",
  needs_qa: "In review",
  client_correction: "Needs correction",
  proof_approval: "Awaiting your approval",
  approved_for_matching: "Finding a supplier",
  supplier_assigned: "Supplier offered",
  supplier_accepted: "Supplier accepted",
  awaiting_payment: "Awaiting payment",
  payment_authorized: "Payment authorized",
  production: "In production",
  supplier_self_qc: "Quality check",
  ready_for_dispatch: "Ready for pickup",
  rider_assigned: "Rider assigned",
  picked_up: "Picked up",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
  issue_window_open: "Issue window open",
  completed: "Completed",
  payout_released: "Payout released",
  cancelled: "Cancelled",
};

/** Tone per state. `neutral` means "in flight, nothing to act on". */
export const ORDER_STATE_TONE: Record<OrderState, StatusTone> = {
  draft: "neutral",
  submitted: "neutral",
  needs_qa: "info",
  client_correction: "warning",
  proof_approval: "warning",
  approved_for_matching: "info",
  supplier_assigned: "info",
  supplier_accepted: "info",
  awaiting_payment: "warning",
  payment_authorized: "success",
  production: "info",
  supplier_self_qc: "info",
  ready_for_dispatch: "info",
  rider_assigned: "info",
  picked_up: "info",
  out_for_delivery: "info",
  delivered: "success",
  delivery_failed: "error",
  issue_window_open: "info",
  completed: "success",
  payout_released: "success",
  cancelled: "neutral",
};

/**
 * Legal forward transitions.
 *
 * The gates worth reading twice, because the PRD makes them non-negotiable:
 * nothing reaches `approved_for_matching` without passing through QA, and
 * nothing reaches `production` without `payment_authorized` first. A supplier
 * decline and a payment expiry both fall back to `approved_for_matching` so
 * matching restarts rather than the order dying.
 */
const TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["needs_qa", "cancelled"],
  needs_qa: ["client_correction", "proof_approval", "approved_for_matching", "cancelled"],
  client_correction: ["needs_qa", "cancelled"],
  proof_approval: ["approved_for_matching", "client_correction", "cancelled"],
  approved_for_matching: ["supplier_assigned", "cancelled"],
  supplier_assigned: ["supplier_accepted", "approved_for_matching", "cancelled"],
  supplier_accepted: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_authorized", "approved_for_matching", "cancelled"],
  payment_authorized: ["production", "cancelled"],
  production: ["supplier_self_qc", "cancelled"],
  supplier_self_qc: ["ready_for_dispatch", "production"],
  ready_for_dispatch: ["rider_assigned"],
  rider_assigned: ["picked_up"],
  picked_up: ["out_for_delivery"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivered: ["issue_window_open"],
  delivery_failed: ["rider_assigned"],
  issue_window_open: ["completed"],
  completed: ["payout_released"],
  payout_released: [],
  cancelled: [],
};

/** The states reachable from `from` in one step. Empty means terminal. */
export function nextStates(from: OrderState): readonly OrderState[] {
  return TRANSITIONS[from];
}

/** Whether `from -> to` is a legal single step. */
export function canTransition(from: OrderState, to: OrderState): boolean {
  return TRANSITIONS[from].includes(to);
}
```

`src/index.ts`:

```ts
export * from "./order-state";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 7 tests.

- [ ] **Step 6: Verify the build produces a consumable package**

```bash
npm run build
ls dist
```

Expected: `dist/index.js`, `dist/index.d.ts`, `dist/order-state.js`, `dist/order-state.d.ts`.

- [ ] **Step 7: Create the remote and commit**

```bash
git add -A
git commit -m "feat: add the order state machine"
gh repo create rqms40/gridgo-core --private --source=. --remote=origin --push
```

---

### Task 3: Add money handling to gridgo-core

The COD ceiling appears in the client's payment picker, the rider's collection screen, and Operations' reconciliation. Three copies of `150000` is three chances to write `15000`.

**Files:**
- Create: `shared/gridgo-core/src/money.ts`
- Modify: `shared/gridgo-core/src/index.ts`
- Test: `shared/gridgo-core/src/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const COD_LIMIT_MINOR = 150_000`
  - `function formatPHP(minor: number): string`
  - `function toMinor(pesos: number): number`
  - `function isCodEligibleAmount(finalTotalMinor: number): boolean`

- [ ] **Step 1: Write the failing test**

`src/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { COD_LIMIT_MINOR, formatPHP, isCodEligibleAmount, toMinor } from "./money";

describe("formatPHP", () => {
  it("renders minor units as pesos and centavos", () => {
    expect(formatPHP(150000)).toBe("₱1,500.00");
    expect(formatPHP(150001)).toBe("₱1,500.01");
    expect(formatPHP(0)).toBe("₱0.00");
    expect(formatPHP(5)).toBe("₱0.05");
    expect(formatPHP(99)).toBe("₱0.99");
  });

  it("groups thousands", () => {
    expect(formatPHP(100000000)).toBe("₱1,000,000.00");
    expect(formatPHP(99999)).toBe("₱999.99");
  });

  it("renders a negative adjustment with the sign before the symbol", () => {
    expect(formatPHP(-25050)).toBe("-₱250.50");
  });
});

describe("toMinor", () => {
  it("converts pesos to centavos without float drift", () => {
    expect(toMinor(1500)).toBe(150000);
    expect(toMinor(0.1)).toBe(10);
    expect(toMinor(1.15)).toBe(115);
    expect(toMinor(19.99)).toBe(1999);
  });
});

describe("isCodEligibleAmount", () => {
  it("accepts exactly ₱1,500", () => {
    expect(COD_LIMIT_MINOR).toBe(150000);
    expect(isCodEligibleAmount(150000)).toBe(true);
  });

  it("rejects ₱1,501", () => {
    expect(isCodEligibleAmount(150100)).toBe(false);
  });

  it("rejects a single centavo over the ceiling", () => {
    expect(isCodEligibleAmount(150001)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 3: Write the implementation**

`src/money.ts`:

```ts
/**
 * PHP money.
 *
 * Every amount in GRIDGO is stored and passed as minor units — centavos, as
 * an integer. Nothing in this codebase should ever hold a peso float; 0.1 +
 * 0.2 is the reason.
 *
 * Formatting is done by hand rather than with Intl.NumberFormat. Hermes ships
 * different ICU coverage per platform, and a currency string that silently
 * renders as "PHP 1,500.00" on one device and "₱1,500.00" on another is not
 * something to discover in a delivery flow.
 */

/**
 * The COD ceiling: a final total of ₱1,500 inclusive.
 *
 * "Final total" means including delivery fee and approved adjustments — see
 * the Product Requirements Document, section 6. The server is the authority;
 * this constant exists so the UI offers the same answer the server will give,
 * not so the UI can decide.
 */
export const COD_LIMIT_MINOR = 150_000;

/** Formats minor units as a peso string: `150000` -> `"₱1,500.00"`. */
export function formatPHP(minor: number): string {
  const value = Math.trunc(minor);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);

  const pesos = Math.floor(absolute / 100);
  const centavos = absolute % 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${sign}₱${grouped}.${String(centavos).padStart(2, "0")}`;
}

/**
 * Converts a peso amount to minor units.
 *
 * Rounds rather than truncates: `1.15 * 100` is `114.99999999999999` in IEEE
 * 754, and truncating would quietly lose a centavo on every such amount.
 */
export function toMinor(pesos: number): number {
  return Math.round(pesos * 100);
}

/**
 * Whether a final total is within the COD ceiling.
 *
 * This is one of three COD conditions. The other two — a verified pilot
 * client, and no other active unpaid COD order — are server-side facts this
 * package cannot see. Never treat a `true` here as "COD is available".
 */
export function isCodEligibleAmount(finalTotalMinor: number): boolean {
  return finalTotalMinor <= COD_LIMIT_MINOR;
}
```

Add to `src/index.ts`:

```ts
export * from "./money";
export * from "./order-state";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 14 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/money.ts src/money.test.ts src/index.ts
git commit -m "feat: add PHP minor-unit money handling and the COD ceiling"
```

---

### Task 4: Move the design tokens into gridgo-core

Tokens move rather than get copied: `constants/theme.ts` in the client becomes a re-export, so there is exactly one place a hex value is written down for all four surfaces including the web portal.

**Files:**
- Create: `shared/gridgo-core/src/tokens.ts`
- Modify: `shared/gridgo-core/src/index.ts`
- Test: `shared/gridgo-core/src/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ThemeName = "light" | "dark"`
  - `type ColorToken` — keys of the colour record
  - `const colors: Record<ThemeName, Record<ColorToken, string>>`
  - `const fontFamily: { regular; medium; bold; black }` (family name strings only)
  - `const typography`, `const spacing`, `const radius`, `const motion`, `const emphasis`
  - `const pagePadding: number`, `const touchTarget: number`

- [ ] **Step 1: Write the failing test**

`src/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { colors, radius, touchTarget, typography } from "./tokens";

describe("tokens", () => {
  it("defines the same token names in both themes", () => {
    expect(Object.keys(colors.dark).sort()).toEqual(Object.keys(colors.light).sort());
  });

  it("keeps actionYellow identical across themes", () => {
    expect(colors.light.actionYellow).toBe("#FFDE58");
    expect(colors.dark.actionYellow).toBe("#FFDE58");
    expect(colors.light.actionYellowOn).toBe("#1A1A1A");
    expect(colors.dark.actionYellowOn).toBe("#1A1A1A");
  });

  it("keeps dark surfaces off the canvas so cards stay visible", () => {
    expect(colors.dark.canvas).toBe("#000000");
    expect(colors.dark.surface).not.toBe(colors.dark.canvas);
  });

  it("meets the 44dp touch target floor", () => {
    expect(touchTarget).toBe(44);
  });

  it("keeps every type step at 12px or above, except the tab-bar label", () => {
    for (const [name, step] of Object.entries(typography)) {
      if (name === "nav") continue;
      expect(step.fontSize, name).toBeGreaterThanOrEqual(12);
    }
  });

  it("exposes the radius vocabulary by role, not by number", () => {
    expect(radius.field).toBe(12);
    expect(radius.card).toBe(16);
    expect(radius.pill).toBe(9999);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./tokens"`.

- [ ] **Step 3: Write the implementation**

Create `src/tokens.ts` by copying the bodies of `colors`, `typography`, `spacing`, `pagePadding`, `radius`, `touchTarget`, `emphasis`, and `motion` verbatim from `mobile/gridgo-client/constants/theme.ts`, with two changes:

1. Add the `fontFamily` map locally instead of importing it from `@/constants/fonts` — this package must not reach into an app, and the family names are plain strings:

```ts
/**
 * Satoshi family names.
 *
 * Names only. The `require()` calls that load the actual .otf files stay in
 * each app, because Metro must resolve those relative to the app bundle.
 * Registration order is in `design/fonts/` alongside the files themselves.
 */
export const fontFamily = {
  regular: "Satoshi-Regular",
  medium: "Satoshi-Medium",
  bold: "Satoshi-Bold",
  black: "Satoshi-Black",
} as const;
```

2. Do **not** move `elevation`. Its `shadowOffset: { width, height }` shape is a React Native style object; the web portal needs a CSS `box-shadow` instead. It stays in each app.

Keep the file header explaining what this file is:

```ts
/**
 * GRIDGO design tokens.
 *
 * The token tables in the Design Requirements Document are the source of
 * truth for the values; this file is where they become code, once, for every
 * surface — the three mobile apps and the web portal.
 *
 * `design/global.css` in this same package is the NativeWind mirror of these
 * values. Change one and change the other; the drift check in each app's CI
 * only catches a stale *copy*, not a mismatch between these two files.
 */
```

Add to `src/index.ts`:

```ts
export * from "./money";
export * from "./order-state";
export * from "./tokens";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 20 tests total.

- [ ] **Step 5: Commit and tag the first release**

```bash
npm run build
git add -A
git commit -m "feat: add the design tokens"
git tag v0.1.0
git push origin dev --tags
```

---

### Task 5: Consume @gridgo/core from gridgo-client

This is the task that proves the whole structure. If a git-tag install does not resolve cleanly through Metro, it is better to find out now with one consumer than after three apps depend on it.

**Files:**
- Modify: `mobile/gridgo-client/package.json`
- Modify: `mobile/gridgo-client/constants/theme.ts`
- Test: `mobile/gridgo-client/constants/__tests__/theme.test.ts`

**Interfaces:**
- Consumes: `@gridgo/core` — `colors`, `typography`, `spacing`, `pagePadding`, `radius`, `touchTarget`, `emphasis`, `motion`, `fontFamily`, `ThemeName`, `ColorToken`.
- Produces: `constants/theme.ts` keeps its existing public surface, so no screen or component changes. `elevation` remains defined locally.

- [ ] **Step 1: Install the package from the tag**

```bash
cd ~/personal/projects/mobile/gridgo/mobile/gridgo-client
npm install "git+ssh://git@github.com/rqms40/gridgo-core.git#v0.1.0"
node -e "console.log(require('@gridgo/core').ORDER_STATE_LABEL.needs_qa)"
```

Expected: prints `In review`. If it does not, the `prepare` script did not run — check that `dist/` exists under `node_modules/@gridgo/core`.

- [ ] **Step 2: Write the failing test**

`constants/__tests__/theme.test.ts`:

```ts
import { colors as coreColors, radius as coreRadius } from "@gridgo/core";

import { colors, elevation, radius } from "@/constants/theme";

describe("theme", () => {
  it("takes its token values from @gridgo/core, not a local copy", () => {
    expect(colors).toBe(coreColors);
    expect(radius).toBe(coreRadius);
  });

  it("keeps the React Native shadow shape local to the app", () => {
    expect(elevation.card.shadowOffset).toEqual({ width: 0, height: 1 });
    expect(elevation.sheet.elevation).toBe(8);
  });
});
```

`toBe` rather than `toEqual` is deliberate: it asserts the same object, which a re-export gives and a copy never does.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest constants/__tests__/theme.test.ts`
Expected: FAIL — the objects are not identical, because `theme.ts` still defines its own.

- [ ] **Step 4: Rewrite constants/theme.ts as a re-export**

Replace the entire file with:

```ts
/**
 * GRIDGO design tokens, for JavaScript consumers.
 *
 * The values live in `@gridgo/core` so all three mobile apps and the web
 * portal read one definition. This file is the app's door onto them, plus the
 * one token that cannot be shared: `elevation` carries a React Native shadow
 * shape, and the web portal needs a CSS box-shadow instead.
 *
 * Styling belongs in NativeWind classes — reach for these values only where a
 * class cannot go: the React Navigation theme, the status bar, the system UI
 * background, map styles, and anything on the AGENTS.md style exception list.
 *
 * `global.css` is the CSS mirror of the same tokens and is synced from
 * `@gridgo/core/design`. Do not edit it here; edit it there and re-sync.
 */

export {
  colors,
  emphasis,
  fontFamily,
  motion,
  pagePadding,
  radius,
  spacing,
  touchTarget,
  typography,
  type ColorToken,
  type ThemeName,
} from "@gridgo/core";

/**
 * Border first. Use these only when a border cannot carry the separation.
 *
 * Stays local: `shadowOffset` is a React Native style object, and the shared
 * package has to remain usable from the web portal.
 */
export const elevation = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sheet: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
```

`constants/fonts.ts` is untouched — its `require()` calls must stay in the app.

- [ ] **Step 5: Run the full suite and typecheck**

```bash
npx tsc --noEmit
npm test
```

Expected: PASS. The existing `StatusChip` and `GridgoTabBar` tests must still pass unchanged — they consume `useThemeColors`, which reads `colors`, which now comes from the package.

- [ ] **Step 6: Verify the app still boots**

```bash
npx expo start --clear
```

Expected: bundles without a resolution error, onboarding renders, fonts load, dark mode switches. Stop the server once confirmed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json constants/theme.ts constants/__tests__/theme.test.ts
git commit -m "refactor: read design tokens from @gridgo/core"
```

---

### Task 6: Move the design system into gridgo-core and add the sync + drift check

The CSS layer, the font binaries, and the base components cannot be resolved from `node_modules` reliably under NativeWind 5-preview and Metro. So they are copied into each app — and a CI check makes the copy honest.

**Files:**
- Create: `shared/gridgo-core/design/manifest.json`
- Create: `shared/gridgo-core/design/global.css` (moved from the client)
- Create: `shared/gridgo-core/design/fonts/` (moved from the client)
- Create: `shared/gridgo-core/design/components/` (moved from the client)
- Create: `shared/gridgo-core/design/hooks/useTheme.ts` (moved from the client)
- Create: `mobile/gridgo-client/scripts/sync-design.mjs`
- Create: `mobile/gridgo-client/.github/workflows/ci.yml`
- Modify: `mobile/gridgo-client/package.json` (scripts)

**Interfaces:**
- Consumes: `@gridgo/core` from Task 5.
- Produces:
  - `npm run sync:design` — copies every manifest path from `node_modules/@gridgo/core/design` into the app
  - `npm run check:design` — exits non-zero if any synced file differs from the package
  - The manifest format later tasks add to: `{ "files": [{ "from": string, "to": string }] }`

- [ ] **Step 1: Move the design files into gridgo-core**

```bash
CORE=~/personal/projects/mobile/gridgo/shared/gridgo-core
APP=~/personal/projects/mobile/gridgo/mobile/gridgo-client

mkdir -p "$CORE/design/fonts" "$CORE/design/components/illustrations" "$CORE/design/hooks"
cp "$APP/global.css"            "$CORE/design/global.css"
cp "$APP/assets/fonts/"*        "$CORE/design/fonts/"
cp "$APP/hooks/useTheme.ts"     "$CORE/design/hooks/useTheme.ts"
cp "$APP/components/PrimaryButton.tsx"   "$CORE/design/components/"
cp "$APP/components/SecondaryButton.tsx" "$CORE/design/components/"
cp "$APP/components/StatusChip.tsx"      "$CORE/design/components/"
cp "$APP/components/GridgoLogo.tsx"      "$CORE/design/components/"
ls -R "$CORE/design"
```

`GridgoTabBar`, `PaginationDots`, `SpecRow`, `ScreenPlaceholder`, and the illustrations stay in the client. They are client screens' furniture, not the shared system — the rider app will want a different tab bar and no onboarding dots.

- [ ] **Step 2: Point StatusChip at the shared tone type**

In `$CORE/design/components/StatusChip.tsx`, remove the locally-declared `StatusTone` and import it, so a status chip and an order state cannot disagree about what tones exist:

```ts
import { type StatusTone } from "@gridgo/core";

export type { StatusTone };
```

Delete the line `export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";` and leave the rest of the file unchanged.

- [ ] **Step 3: Write the manifest**

`$CORE/design/manifest.json`:

```json
{
  "files": [
    { "from": "global.css", "to": "global.css" },
    { "from": "fonts/Satoshi-Regular.otf", "to": "assets/fonts/Satoshi-Regular.otf" },
    { "from": "fonts/Satoshi-Medium.otf", "to": "assets/fonts/Satoshi-Medium.otf" },
    { "from": "fonts/Satoshi-Bold.otf", "to": "assets/fonts/Satoshi-Bold.otf" },
    { "from": "fonts/Satoshi-Black.otf", "to": "assets/fonts/Satoshi-Black.otf" },
    { "from": "fonts/Satoshi-LICENSE.txt", "to": "assets/fonts/Satoshi-LICENSE.txt" },
    { "from": "hooks/useTheme.ts", "to": "hooks/useTheme.ts" },
    { "from": "components/PrimaryButton.tsx", "to": "components/PrimaryButton.tsx" },
    { "from": "components/SecondaryButton.tsx", "to": "components/SecondaryButton.tsx" },
    { "from": "components/StatusChip.tsx", "to": "components/StatusChip.tsx" },
    { "from": "components/GridgoLogo.tsx", "to": "components/GridgoLogo.tsx" }
  ]
}
```

- [ ] **Step 4: Commit and release gridgo-core v0.2.0**

```bash
cd "$CORE"
npm run build
git add -A
git commit -m "feat: ship the design system as syncable files"
git tag v0.2.0
git push origin dev --tags
```

- [ ] **Step 5: Write the sync script**

`$APP/scripts/sync-design.mjs`:

```js
#!/usr/bin/env node
/**
 * Syncs the shared design system out of @gridgo/core into this app.
 *
 * The CSS layer, the font binaries and the base components are copied rather
 * than imported. NativeWind 5-preview resolves a Tailwind layer out of
 * node_modules unreliably, and Metro's asset resolution for a font inside a
 * package is its own adventure — copying sidesteps both, at the cost of
 * needing this script and the --check mode that keeps the copies honest.
 *
 *   node scripts/sync-design.mjs           copy, overwriting local files
 *   node scripts/sync-design.mjs --check   compare only, exit 1 on any drift
 *
 * A synced file is not yours to edit. Change it in gridgo-core, cut a tag,
 * bump the dependency, re-sync.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN = join(APP, "node_modules", "@gridgo", "core", "design");
const check = process.argv.includes("--check");

const digest = async (path) => {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch {
    return null;
  }
};

const manifest = JSON.parse(await readFile(join(DESIGN, "manifest.json"), "utf8"));
const drifted = [];

for (const file of manifest.files) {
  const source = join(DESIGN, file.from);
  const target = join(APP, file.to);

  if (check) {
    if ((await digest(source)) !== (await digest(target))) drifted.push(file.to);
    continue;
  }

  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

if (!check) {
  console.log(`Synced ${manifest.files.length} design files from @gridgo/core.`);
} else if (drifted.length > 0) {
  console.error("Design system drift — these files differ from @gridgo/core:\n");
  for (const path of drifted) console.error(`  ${path}`);
  console.error("\nEdit them in gridgo-core, tag a release, then run: npm run sync:design");
  process.exit(1);
} else {
  console.log(`All ${manifest.files.length} design files match @gridgo/core.`);
}
```

Add to `package.json` scripts:

```json
    "sync:design": "node scripts/sync-design.mjs",
    "check:design": "node scripts/sync-design.mjs --check",
```

- [ ] **Step 6: Run the sync and verify the check catches drift**

```bash
cd "$APP"
npm install "git+ssh://git@github.com/rqms40/gridgo-core.git#v0.2.0"
npm run sync:design
npm run check:design
```

Expected: sync reports 11 files; check reports all 11 match.

Now prove the check actually fails:

```bash
printf '\n/* drift */\n' >> global.css
npm run check:design; echo "exit=$?"
```

Expected: lists `global.css` and prints `exit=1`.

```bash
npm run sync:design
npm run check:design; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 7: Verify the app still builds after the sync**

```bash
npx tsc --noEmit
npm test
npx expo start --clear
```

Expected: typecheck clean, tests pass, app boots with fonts and theming intact. Stop the server once confirmed.

- [ ] **Step 8: Add CI**

`$APP/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [dev, main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # Fails the build if a synced design file was edited in place instead of
      # in gridgo-core. This is what keeps three apps looking like one product.
      - run: npm run check:design
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: sync the design system from @gridgo/core and check it in CI"
git push
```

---

### Task 7: Scaffold gridgo-rider

The rider app is a separate binary chiefly because background location and the Navigation SDK would otherwise impose a store-review burden and a bundle cost on the client app. This task establishes the repo and proves it consumes the shared system; location work is a later plan.

**Files:**
- Create: `mobile/gridgo-rider/` (Expo app)
- Create: `mobile/gridgo-rider/AGENTS.md`
- Create: `mobile/gridgo-rider/app/_layout.tsx`
- Create: `mobile/gridgo-rider/app/index.tsx`
- Test: `mobile/gridgo-rider/app/__tests__/index.test.tsx`

**Interfaces:**
- Consumes: `@gridgo/core` v0.2.0 — `ORDER_STATE_LABEL`, `ORDER_STATE_TONE`, `formatPHP`, tokens; and the synced `StatusChip`, `useTheme`, `global.css`, fonts.
- Produces: a booting Expo app at `ph.gridgo.rider` with the shared design system in place.

- [ ] **Step 1: Create the app and strip the template**

```bash
cd ~/personal/projects/mobile/gridgo/mobile
npx create-expo-app@latest gridgo-rider --template blank-typescript
cd gridgo-rider
git init -b dev
```

- [ ] **Step 2: Match the client's toolchain**

Install the same versions the client runs — do not let `create-expo-app` pick newer ones, or the two apps drift before the first commit:

```bash
npx expo install expo-router expo-constants expo-font expo-splash-screen \
  expo-status-bar expo-system-ui expo-linking react-native-safe-area-context \
  react-native-screens react-native-gesture-handler react-native-reanimated \
  react-native-svg
npm install nativewind@5.0.0-preview.4 react-native-css@^3.0.7 \
  tailwindcss@^4 @tailwindcss/postcss@^4.3.3 lucide-react-native@^1.28.0
npm install -D jest@^29.7.0 jest-expo@^54.0.17 @testing-library/react-native@^14.0.1 \
  @types/jest@^30.0.0 eslint@^9.25.0 eslint-config-expo@~10.0.0 typescript@~5.9.2
npm install "git+ssh://git@github.com/rqms40/gridgo-core.git#v0.2.0"
```

Copy these four files from `mobile/gridgo-client` unchanged — they are toolchain config, not app code: `metro.config.js`, `postcss.config.mjs`, `eslint.config.js`, `jest.setup.js`.

Copy `tsconfig.json` and the `jest` and `overrides` blocks from the client's `package.json`.

- [ ] **Step 3: Set the identifiers**

`app.json`:

```json
{
  "expo": {
    "name": "GRIDGO Rider",
    "slug": "gridgo-rider",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "gridgorider",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "ph.gridgo.rider"
    },
    "android": {
      "package": "ph.gridgo.rider",
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false
    },
    "plugins": ["expo-router"],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

`supportsTablet` is `false`: a rider app runs on a phone in a vehicle mount.

- [ ] **Step 4: Bring in the design system**

```bash
mkdir -p scripts
cp ../gridgo-client/scripts/sync-design.mjs scripts/
cp ../gridgo-client/constants/fonts.ts constants/fonts.ts 2>/dev/null || \
  (mkdir -p constants && cp ../gridgo-client/constants/fonts.ts constants/fonts.ts)
cp ../gridgo-client/constants/theme.ts constants/theme.ts
cp ../gridgo-client/hooks/useAppFonts.ts hooks/useAppFonts.ts 2>/dev/null || \
  (mkdir -p hooks && cp ../gridgo-client/hooks/useAppFonts.ts hooks/useAppFonts.ts)
```

Add the sync scripts to `package.json`, then run them:

```json
    "sync:design": "node scripts/sync-design.mjs",
    "check:design": "node scripts/sync-design.mjs --check",
```

```bash
npm run sync:design
npm run check:design
```

Expected: 11 files synced and matching.

- [ ] **Step 5: Write the failing test**

`app/__tests__/index.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";

import Home from "@/app/index";

describe("rider home", () => {
  it("labels an order state with the words every GRIDGO app uses", async () => {
    await render(<Home />);

    expect(screen.getByText("Ready for pickup")).toBeTruthy();
  });
});
```

The assertion is deliberately about the shared label, not about the screen: it fails if the rider app ever stops reading `@gridgo/core`, which is the thing worth guarding.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest app/__tests__/index.test.tsx`
Expected: FAIL — cannot resolve `@/app/index`.

- [ ] **Step 7: Write the placeholder screen and root layout**

`app/index.tsx`:

```tsx
import { ORDER_STATE_LABEL, ORDER_STATE_TONE } from "@gridgo/core";
import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";

/**
 * Placeholder home.
 *
 * It exists to prove the shared system is wired end to end — tokens, fonts,
 * CSS layer, the synced StatusChip, and the order-state vocabulary. The real
 * rider surfaces (offer, navigation, pickup OTP, delivery proof) arrive in
 * their own plan.
 */
export default function Home() {
  const state = "ready_for_dispatch" as const;

  return (
    <View className="gg-screen gg-page items-center justify-center gap-4">
      <Text className="text-h2 text-text-primary">GRIDGO Rider</Text>
      <StatusChip
        tone={ORDER_STATE_TONE[state]}
        label={ORDER_STATE_LABEL[state]}
        icon="clock"
      />
    </View>
  );
}
```

`app/_layout.tsx`: copy the client's `app/_layout.tsx`, then delete the four `<Stack.Screen>` children for `index`, `onboarding`, `(tabs)`, and `design-system`, and replace them with:

```tsx
          <Stack.Screen name="index" options={{ headerShown: false }} />
```

Everything else in that file — the navigation theme, the splash-screen gate, the `SystemUI` background effect — carries over unchanged.

Set `"main": "expo-router/entry"` in `package.json`.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx jest app/__tests__/index.test.tsx`
Expected: PASS.

- [ ] **Step 9: Verify the app boots**

```bash
npx tsc --noEmit
npm run lint
npm test
npx expo start --clear
```

Expected: typecheck clean, lint clean, tests pass, and the app renders "GRIDGO Rider" in Satoshi above a "Ready for pickup" chip that switches themes with the system. Stop the server once confirmed.

- [ ] **Step 10: Write AGENTS.md**

Copy `mobile/gridgo-client/AGENTS.md` and change the `## Project Overview` section to:

```markdown
## Project Overview

This repo is **GRIDGO Rider** — the delivery app for a Davao City
managed-printing marketplace.

GRIDGO ships one app per role. The Client app lives in `gridgo-client`, the
Supplier app in `gridgo-supplier`, and the admin portals in `gridgo-portal`.
Anything all three mobile apps must agree on — order states and their labels,
money handling, design tokens — comes from `@gridgo/core` and is never
redefined here.

This app includes:

- Delivery offer with pickup/drop-off, distance, fee, and an accept countdown.
- Navigation to pickup and a persistent live-location-sharing status banner.
- Pickup verification: 4-digit OTP plus photo proof.
- Delivery verification: photo proof, recipient OTP, and COD cash collection
  evidence.
- Failed-delivery reporting with return handling.

**Location and privacy**

Exact location sharing begins at confirmed pickup and ends at delivery,
failure, or cancellation — never before, never after. Foreground pings every
10 seconds, background every 30. Never persist rider location, ETAs, or OTPs.

**The synced design system**

`global.css`, `assets/fonts/`, `hooks/useTheme.ts`, and the base components
listed in `@gridgo/core/design/manifest.json` are **copies**. Do not edit them
here — CI will reject it. Change them in `gridgo-core`, tag a release, bump the
dependency, and run `npm run sync:design`.
```

- [ ] **Step 11: Add CI and commit**

```bash
mkdir -p .github/workflows
cp ../gridgo-client/.github/workflows/ci.yml .github/workflows/ci.yml
git add -A
git commit -m "feat: scaffold the rider app on the shared design system"
gh repo create rqms40/gridgo-rider --private --source=. --remote=origin --push
```

---

## Out of Scope — Follow-on Plans

Each of these produces working software on its own and gets its own plan:

1. **`web/gridgo-portal`** — Next.js app carrying the Supplier portal, Supplier Operations Admin, and Super Admin. Consumes `@gridgo/core` for states, money, and token values; needs its own CSS mirror of `global.css` since Tailwind-for-web and NativeWind diverge.
2. **`mobile/gridgo-supplier`** — same scaffold shape as Task 7. Worth deferring until a supplier actually misses a job alert; the responsive portal covers everything else, and one fewer binary is one fewer store listing during the pilot.
3. **Rider background location** — `expo-location` + `expo-task-manager`, the Play background-location declaration, and the `NavigationService` adapter.
4. **Auth** — blocked on the open question below.
5. **Remaining order exception states** — dispute, refund, adjustment, reprint, collected-by-customer, payout hold, per `GRIDGO_Product_Requirements_Document.md:43`.

## Open Questions

**Clerk or Supabase Auth?** `AGENTS.md` § Authentication says "Use Clerk. Do not build custom auth." `GRIDGO_Product_Requirements_Document.md:21` says "Supabase Auth, PostgreSQL Row Level Security, signed Storage URLs, and private Realtime topics enforce authorization server-side." These are not compatible as written: RLS keys off `auth.uid()` from a Supabase JWT, so Clerk requires either third-party-auth integration or a token exchange, and the choice shapes every app's session layer.

Nothing in this plan depends on the answer — it must be settled before any auth task.
