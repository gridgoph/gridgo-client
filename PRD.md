# GRIDGO Client — PRD (MVP)

Business / organization / teacher **client mobile app**. One app per role — this binary is **client only**.

## Sources

- `gridgo-tinker` full PRD
- Supplier presentation 2026-08-04 (ecosystem, categories, Order→Print→Deliver)
- Current client integration constraints: [AGENTS.md](AGENTS.md#mvp-stack-current-phase)

## Job to be done

Request managed print jobs in Davao: structured specs + artwork → QA/proof → payment → tracked delivery → material-issue reporting. See [README.md](README.md) for the current customer workflow, payment methods and issue window.

## MVP features

| Feature | Status target |
|---|---|
| Client sign-in and role gate; see [auth guidance](AGENTS.md#mvp-stack-current-phase) | required |
| Home summary; see [client product logic](AGENTS.md#client-product-logic-pure-testable) | required |
| Orders list with state labels | required |
| Catalog / product-first categories (flyers, banners, apparel, …) | partial → expand |
| New request stepper (details → artwork → review → confirm) | partial |
| Checkout and payment; see [customer guidance](README.md#checkout-and-money) | required |
| Delivery tracking with current/stale/unavailable location states | required |
| Issue window report | later |
| Light/Dark + design system tokens | required |

## Design system (must stay consistent)

- Brand yellow `#FFDE58` only for primary CTA / active step / active nav / route — finite budget
- Satoshi type; canvas/surface/text tokens from `constants/theme.ts` + `global.css`
- Logo mark (grid + yellow square); no hard-coded random hex
- Status = icon + label + color (never color alone)
- 44px minimum touch targets

## Out of scope here

Supplier production, rider dispatch, Ops QA matching UI.

## Backend

`EXPO_PUBLIC_API_URL` → `gridgo-api`. See that repo’s `PRD.md`.
