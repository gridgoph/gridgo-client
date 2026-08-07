# GRIDGO Client — PRD (MVP)

Business / organization / teacher **client mobile app**. One app per role — this binary is **client only**.

## Sources

- `gridgo-tinker` full PRD
- Supplier presentation 2026-08-04 (ecosystem, categories, Order→Print→Deliver)
- Captain MVP: custom auth + local API, no Clerk/Supabase/PayMongo

## Job to be done

Request managed print jobs in Davao zones: structured specs + artwork → QA/proof → pay with Pilot Credits or eligible COD → track delivery → report material issues within 24h.

## MVP features

| Feature | Status target |
|---|---|
| Custom login (demo API) + role gate | required |
| Home: credits balance + recent orders | required |
| Orders list with state labels | required |
| Catalog / product-first categories (flyers, banners, apparel, …) | partial → expand |
| New request stepper (details → artwork → review → confirm) | partial |
| Pilot Credits authorize / COD ≤ ₱1,500 | API ready; UI wire |
| Delivery tracking card (demo locations) | later |
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
