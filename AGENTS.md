# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

You are an expert React Native and Expo engineer helping me build GRIDGO.

Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.

Think like a senior mobile developer.

---

## Project Overview

This repo is **GRIDGO Client** — the business-client app for a Davao City managed-printing marketplace. It carries a print job from self sign-up and a structured request, through artwork QA and proof approval, a 75/25 digital payment, and the supplier's fulfilment milestones, to tracked delivery and the issue window.

GRIDGO ships one app per role. The Rider app, the Supplier app, and the Supplier Operations Admin / Super Admin web portals are separate codebases. Nothing belonging to another role goes in here: no rider dispatch or location sharing, no supplier production or self-QC, no Operations QA queue or matching. If a task asks for one of those, it is in the wrong repo.

The app includes:

- Product catalog with frequently-reordered items and one-tap reorder.
- Structured print request: a 4-step stepper (Details → Artwork → Review → Confirm) capturing product, size, material, quantity, deadline, and delivery address.
- Artwork upload, QA correction loop, and one proof approval (Approve & Continue / Request Changes) against a preflight checklist — Operations' artwork proof, before matching.
- Visibility of the supplier's fulfilment milestones, which replaced the retired supplier print-proof loop.
- Product Preview: artwork composited into a Flyer, Tarpaulin, Signage, or T-shirt template, always labeled "Visual mockup — not print-ready proof."
- Digital payment in two halves: a 75% QR downpayment that waits on Operations to confirm it, then a 25% balance before delivery.
- Active delivery tracking: map with route, ETA, rider card, and an honest last-updated/stale-location state. The client watches the delivery; it never controls it.
- Order history and reporting a material issue inside the issue window, whose length is one platform-wide setting and which now really expires.
- Self sign-up: a client declares whether they are personal, business or an organization, and that choice drives the lockup for the life of the account.

**Cross-cutting**

- Auth (**Clerk identity + gridgo-api projection**). Clerk owns the identity session; `gridgo-api` remains authoritative for the signed-in user's client projection. A user whose role is not `client` is told which app to use rather than being shown a different role's navigation. There is no role switcher. An explicit Sign In / Sign Up / Google tap never adopts a leftover Clerk session — leftovers can belong to a different person than the email just typed. Sign the leftover out first (`clearClerkSessionForNewAttempt`), then run the attempt. Silent launch restore still lives in `useClerkApiSession`. Sign-out drops the GRIDGO user immediately, times out hung `/auth/logout` and Clerk calls, and sets `signingOut` so the launch bridge cannot rebuild the previous person.
- Light and Dark themes with identical labels, states, and workflows.
- Push/in-app notifications for SLA deadlines and state changes.

Keep the implementation simple and readable.

---

## Tech Stack

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind
- Zustand
- AsyncStorage
- Zustand for client session state
- Clerk Expo identity with the domain API behind `lib/api.ts`; the development-only local API credential path remains available while local deployments still issue `tok_*` sessions.

Do not introduce new major libraries unless there is a strong reason. Ask before installing anything new.

---


## MVP stack (current phase)

Clerk is the identity provider. Supabase, PayMongo, and other production SaaS remain outside this client.

Every screen that needs network uses **`lib/api.ts`** against the shared local **`gridgo-api`**:

- **Auth** — `@clerk/expo` uses SecureStore for the identity session; `hooks/useClerkApiSession.ts` supplies the Bearer to `lib/api.ts` through `clerkTokenProvider` — **Clerk's cached `getToken()`**, never `skipCache` per request, then `lib/clerkSessionBridge.ts` joins it to a `client` projection in Zustand (`store/session.ts`). A Clerk JWT 401 on `GET /auth/me` is unmapped, not a dead session — probe with `ignoreUnauthorized`, then `POST /auth/clerk/activate`, then `/auth/me` after a refreshed token (activate writes `gridgo_role`). Do not null the token provider in an effect cleanup: Clerk recreates `getToken` often, and that gap is how me/activate go out with no Bearer. **`skipCache: true` is a Clerk FAPI round trip, so it is priced like one.** Spending one per API call (and five per sign-in) is what made authentication take seconds and, once Clerk throttled the mints, what produced “Clerk signed you in, but GRIDGO never received an identity token”. Exactly three places may force a mint: after activate writes `gridgo_role` (`clerkFreshSessionToken` as the bridge's `refreshToken`), after gridgo-api answers `401` to a bearer we sent (`request()` retries **once** with `{ force: true }`, and `ignoreUnauthorized` probes are excluded because that 401 means unmapped), and as the fallback inside `clerkSessionToken` when the cache is empty. **Wait for the JWT before either call** — `awaitClerkSessionToken` (probe 0 reads the cache and is immediate; only an empty cache waits, then forces a mint) is what `lib/clerkGridgoSync.ts` and `hooks/useClerkApiSession.ts` use, because a completing Clerk step does not have a token in the same tick and an unauthenticated `/auth/me` returns the *same* `401 unauthorized` an unmapped identity does. **A 401 from activate is never “your session expired”**: Clerk is signed in that second, so the API verified nothing (unknown `azp`, wrong instance, clock skew) and “sign in again” is advice nobody can follow — `lib/clerkSessionBridge.ts` maps it stage-aware to a sign-out-and-retry recovery, and the login screen already draws that button off `sessionError`. Both were the reported “Could not sign in / session expired” on a LAN dev API. Google SSO lives in `lib/googleSso.ts`: after `startSSOFlow`, call `setActive({ session })`. The native return is `app/sso-callback.tsx` — it must activate/adopt (never start Google again) and land through `AuthLandingRedirect`; replacing to login or `/` before that is how a successful return bounced to Welcome. A first JWT miss after Google is normal (`CLERK_SSO_TOKEN_WAIT`); retry token and `/auth/me` and keep the spinner until Home, complete-profile, wrong-role, or a session still dead after that wait. Password and Google both go through `lib/clerkSignIn.ts`: `withSettledClerkSession` clears a leftover Clerk session (`clearClerkSessionForNewAttempt`) so the credentials just typed can run, then `lib/clerkGridgoSync.ts` must set `user` (or `pendingClerkProfile`) in the same tap — `requestClerkSync` alone leaves login up when `useAuth().isSignedIn` is still false. A leftover is adopted on an explicit sign-in tap **only when `projectionForTypedEmail` proves it is the email just typed, as a client** (`same_client`) — signing a good session out instead bought a sign-out, a replayed password and a fresh mint, with `getToken` empty in the gap between them. Any other leftover (`other_account`, `unknown`) is still signed out: it may be a different person. A launch-time leftover with a JWT is still restored by `useClerkApiSession`, unless `signingOut` is set. Password that returns `needs_second_factor` or `needs_client_trust` sends Clerk's email (or listed) second-factor code and reuses the recovery-code step (`store/loginFlow.ts`) — never throw "another verification step" for those statuses. One that cannot mint a JWT is signed out and the attempt retries. Never show "already signed in" / "currently logged in" as a login failure; if GRIDGO cannot adopt, offer sign-out of Clerk. Login has no local-API password fallback.

  **A sign-in control is disabled by the tap it is running, and by nothing else.** `busy` lives in `store/loginFlow.ts`, is raised inside each handler and lowered in that handler's `finally`. It is deliberately **not** `fetchStatus === "fetching"`, and never `session.loading`: both can hang, and a hung one leaves Sign In reading "Signing in…" with no attempt in flight to finish it — the reported "cannot tap login again". The matching store rule is that **`beginClerkSync` must always be answered**: it raises `session.loading`, and only a *result* used to lower it, so a sync abandoned by sign-out (`invalidateClerkGridgoSync`, which `useClerkApiSession` calls on the signed-out leg), superseded by a newer session id, or interrupted by Fast Refresh left the flag raised forever — Zustand outlives the screen. `endClerkSync()` lowers it from `invalidateClerkGridgoSync` and from `syncClerkToGridgo`'s `finally`, guarded on the generation still being current so an abandoned run cannot clear the wait belonging to the sync that replaced it; login's mount drops a leftover too. A guard that cannot proceed (`!signIn`) sets an error **inside** the busy envelope — an early `return` above it is a tap that does nothing, which is indistinguishable from a dead button.

  **Every finished Clerk flow leaves through `lib/clerkComplete.ts`.** `completeClerkAuth` finalizes (or activates the session Clerk says already exists) and then adopts the GRIDGO client; `withSettledClerkSession` clears a leftover first and retries once when Clerk answers "currently logged in". Sign-up and sign-in both call it, from every branch that reaches `complete` — password, emailed code, password reset, Google. Clerk finalizing alone is **not** landing: Home renders on `useSession().user`, so a flow that finalizes without adopting leaves the person on the form watching nothing happen, which is exactly what both reported "does not go home" bugs were. `lib/clerkSignIn.ts` / `lib/clerkSignUp.ts` hold the pure continuations (which status collects a code, which is blocked, and the copy for it) — decide there, never inside a screen.
  Clerk **throws** `You are signed out` from `getToken` / `signOut` once the session is gone. Reach for `clerkSessionToken` and `releaseClerkSession` (both answer instead of throwing, and `releaseClerkSession` times out) — a raw call in an effect is an unhandled rejection, which is the Metro "Unable to authenticate" flood. `logout` must drop `user` before awaiting Clerk or `/auth/logout`, or a hung network keeps Account on screen.
- **Where a session lands is `lib/authLanding.ts`, rendered by `components/AuthLandingRedirect.tsx`.** Complete profile (only when `needsClientProfile`) → Home. A just-activated client is not parked on first-run onboarding; Settings still offers “View onboarding”. Login/signup arm `usePreventRemove` only while `shouldPreventAuthLeave` is true — back must not dump an in-progress code, but a successful adopt must leave. Email/MFA verify uses `components/auth/OtpCodeStep.tsx`; password recovery stays its own step. Five screens each carried their own copy of the ladder and drifted; index, welcome, login, signup, complete-profile and the Google SSO callback now share this one. `app/index.tsx` matters twice over: `Stack.Protected` removes the auth screens in the same commit that a session appears, so the `<Redirect>` an auth screen renders may never run and index is where the guard lands.
- **Custom domain API** — orders, split payments, dispatch, milestones, notifications. Read `docs/OPERATIONAL_MODEL_V2_API.md` in **gridgo-api** for routes, states and money before touching any of it; it supersedes older prose everywhere they disagree.
- **Zustand** — session and feature stores (not React Context for global session).
- **Money** — PHP minor units only. The client sees **subtotal, delivery and total**, and never GRIDGO's commission: the server withholds it by role projection, so a screen that expects it is a bug.
- **Identity boundary** — keep domain screens behind the same `lib/api.ts` surface; they do not call Clerk directly.
- **API base URL** — `getApiBase()` / `resolveApiBase()` in `lib/api.ts`. Precedence: `EXPO_PUBLIC_API_URL` → hostname from Expo dev-server `hostUri` (via `expo-constants`, port from `EXPO_PUBLIC_API_PORT` or `8787`) → Android emulator loopback remapped to `10.0.2.2` → `127.0.0.1`. Do not hardcode a LAN IP or a deployed domain; physical Expo Go devices need the host derived from the packager, and a hosted build needs the variable.
- **Pointing a build at a deployed API** is configuration, never a code change. Set `EXPO_PUBLIC_API_URL` in the build's environment and the origin is inlined at build time by `babel-preset-expo`:

      EXPO_PUBLIC_API_URL=https://api.example.com npx expo export --platform all

  Verified rather than assumed: after that export no `EXPO_PUBLIC_*` name survives in any bundle, and the literal origin is in the Hermes string table for iOS and Android as well as the web JS. So the first branch of `resolveApiBase` short-circuits and none of the dev-server fallbacks below it can be reached — which matters, because a shipped build has no packager to fall back to. `lib/__tests__/apiBase.test.ts` pins the branch, including that `https` on the default port is not given `:8787`. On EAS, set it under the profile's `env` in `eas.json`; the variable must be present at **build** time, not run time.

- **No credential is written into this repository.** The sign-in screen opens with both fields empty (`components/__tests__/keyboardCoverage.test.ts` fails if a value or an account name comes back), and the optional live walk in `store/__tests__/session.live.test.ts` reads `GRIDGO_LIVE_EMAIL` / `GRIDGO_LIVE_PASSWORD` and skips without them. The pilot's demo accounts still exist; their passwords come from deployment configuration.

Product scope for this binary: **`PRD.md`**. Fleet blueprint: `gridgo-tinker`.

### Client product logic (pure, testable)

Prefer these modules over burying rules in screens:

- `lib/orderState.ts` — state labels/tones, phase predicates, `orderNextAction` / `orderWaitingOn` (the one client action per state), `latestNoteForState` (how a rejection reason reaches the screen)
- **Home is a summary, not a second orders list.** `app/(tabs)/home.tsx` answers two questions: is anything waiting on me (`HomeActionRow` docket, verb first), and how do I start something new (one START A PRINT section: `HomeSearchEntry` into the picker, then the five categories as one full-width board of `HomeCategoryRow`s, with the yellow "+" still the primary start). The Orders tab owns the full `OrderCard` list, search, filters, sort and reorder. Do not put those cards back on Home. **The search bar belongs inside that section, never pinned above the docket** — a bar at the top of the screen answers question two first. Nothing in the column is yellow. The two jobs sections are deliberately different shapes, because they are different questions: **needs-you is a flush docket** of dense verb-first rows ("which of these, and what do I do"), and **`HomeJobRow` is a card** ("where has it got to") carrying the job, when it last moved, the precise state chip, and `OrderStageRail`'s `compact` variant — segments plus stage labels, roughly a quarter the height of the notification rail, because three full rails would push the start menu off the screen. The chip and the rail are not one fact twice: the rail is coarse by design and the chip is the exact state. An unknown state still draws no rail. Money, quantity and reorder stay off both; "View all" (the one place the `brand` token is spent, as a small link) goes to Orders. **A Home with nothing on press is the one place Home introduces the platform.** It greets the client by first name — the header row still never carries it — and draws `HomeSampleStrip`: real shop samples at real "From" prices, picked by `lib/homeSamples.ts` one per family in tree order, preferring a photographed listing over a cheaper blank one, so the strip says what GRIDGO makes rather than what one family makes. It is not the grey "No print jobs yet" slab that used to sit there — that spent Home's best space on a button the start board already is. It reads only `HOME_BOARDS` boards (`loadCategoryBoards("", { maxBoards })`, cache-keyed by the cap so a short Home read cannot shorten the category screen's), only when there are no orders at all, and is left out entirely when the read fails or comes back empty: an empty shelf is worse than no shelf. No shop is named on it, and there is still no how-it-works strip. **The start menu is a board, never a grid**: five families in two columns left the fifth alone beside an empty half-row, halved every target, and truncated the contents line mid-item on three of five ("Plaques & Trophies and 2 …") — that line is the one a person actually reads, so it must be set whole. One column of hairline-divided rows inside `gg-card-flush` is what fits a phone. `lib/categoryLook.ts` holds the two pure lookups the row needs — the short label (the governed names do not fit a menu at any width; the catalogue name stays the accessibility label and stays the heading on `app/request/[category].tsx`) and the glyph *name*, with `HomeCategoryRow` owning the Lucide registry, the same lib/UI split `lib/orderState.ts` keeps with `StatusChip`. The row's mark sits in `CropMarkFrame`, so the menu and the shops' real sample photos read as one board rather than a borrowed product list — and it is also what tells these rows apart from the needs-you docket, which carries no mark.
- `lib/payment.ts` — the 75/25 split: which half is payable, which is with Operations, reference validation, and the copy that says GRIDGO takes QR only. **Cash on delivery and Pilot Credits are not payment methods** — both routes are `410`/`400` server-side, and offering either walks a client into an error. Balance is asked for from `ready_for_dispatch` onward, not the moment the downpayment clears, or the split is a fiction
- **`lib/gridgoOffice.ts` — GRIDGO is the counter, and the client never sees a print shop.** Two rules, one owner. **(a)** No client-facing surface carries a shop's name or street address — not the match, its card, the listing sheet, a checkout group, a line caption, a map pin, or an accessibility label. Matching still assigns a real supplier and `supplierId` still travels on every cart line and call; only the *reading* changes: a basket groups into "Print run 1/2" (`printRuns` in `lib/basket.ts`, never shop names), the listing sheet's eyebrow is GRIDGO, and `lib/match.ts` writes the why-line without naming or counting shops. Do not put the name back as a subtitle or a hint. **(b)** Pickup is **GRIDGO Office** at `7.132670, 125.611265` — one pin, however many presses ran the job. A rider brings each finished run there. `publicOrderFor` in **gridgo-api** enforces the same thing at the projection: a client's `pickup` is the office on a collected order and is **withheld entirely** on a delivered one, while ops, the assigned supplier and riders keep the shop, which is where the rider really drives. Keep the two constants (`lib/gridgoOffice.ts`, `src/gridgo-office.js`) in step
- `components/MatchingWait.tsx` — the wait while `POST /me/matches` runs. The GRIDGO mark's own 3x3 geometry: nine quiet dots and one yellow token walking out from the centre and once round, closing on the top-right cell the logo lights. Reanimated, one shared value, reduce motion holds the token on that last beat. Not `GridgoLogo` (identity surfaces only) and not a skeleton — what lands is one card whose content is a decision, and a grey rectangle stands in for nothing. Two things it must not grow back, both killed against screenshots: **a trail behind the token** (on any route worth watching the lit cells are not adjacent, so it reads as scattered noise) and **ink that persists through the loop** (a grid filling nine-ninths is a progress bar, and a match has no progress to report). It carries **no time estimate** either: a wait that overruns its own copy reads as broken
- `lib/fulfilment.ts` — the supplier's milestones as the client may read them: `printing`, `packaging_qc`, `delivered`. `retention` is a hold-back on someone else's payout and is deliberately not shown, and the server withholds milestone amounts
- `lib/signup.ts` — client self sign-up and the Google profile-complete lockup (`needsClientProfile`); account type reaches `GridgoLogo` through the session and must not be re-derived
- `lib/accountProfile.ts` — the account after sign-up: the identity card's headline (a business is its business name; **never inferred from `orgName`**, same rule as the lockup), the details form, and the stepped business upgrade. Contract is `src/account-profile-routes.js` in **gridgo-api** — `GET /me`, `PATCH /me` (**`expectedVersion` is required**, and a 409 is only stale when the code is `account_version_conflict`; `/me` also answers 409 for an identity with no client profile), `POST /me/business-apply` (`businessName`, and the address sent **whole** rather than by id — GRIDGO matches it against the saved ones, so a saved address comes back as itself). Account is the one home for the match ranking; Settings keeps theme and onboarding. Nothing writes an account type locally: the next `/me` would overwrite it, and meanwhile the client is told they are something the platform has not heard of
- `lib/googleSso.ts` / `lib/clerkSessionBridge.ts` — Google `setActive` completion, and the activate-then-`/auth/me` bridge (wrong role signs out of Clerk)
- `lib/clerkComplete.ts` / `lib/authLanding.ts` — the one way out of a finished Clerk flow, and the one ladder that decides where it lands (see **Auth** above)
- `lib/clerkIdentity.ts` — the half of the account **Clerk** owns: the photo, the sign-in email, the sign-in password, and the name behind them. `clientIdentity(clerk, gridgo)` is a pure synchronous read of `useUser()`, and **Your details must never block on `GET /me` to draw a person**: it did, and a `/me` that hung or 401'd left `app/account-details.tsx` on skeleton bars forever while Clerk held the person and the session held the account. `/me` is now a timed refresh (`ACCOUNT_READ_TIMEOUT_MS`) for the phone, organisation name and version only, and its failure is one quiet line under details that are still true. The screen draws the split as two grammars — what Clerk owns takes *steps*, so it is a row that states the value and leads somewhere; what GRIDGO owns takes *keystrokes*, so it is a field, and the fields share one Save. The name is the one detail both hold, so a save writes GRIDGO first (its refusal stops the save) and `syncClerkName` after, which may fail on its own without discarding a correction that landed. Email and password are screens of their own (`app/change-email.tsx`, `app/change-password.tsx`). Clerk can accept a new address while GRIDGO keeps its own, because GRIDGO will not take an address another client's record holds — `emailKeptByGridgo` is that ending and it is never reported as success. Everything here is the Clerk **user resource** (`setProfileImage`, `createEmailAddress` + `prepareVerification`/`attemptVerification`, `update`, `updatePassword` with `signOutOfOtherSessions`), each checked against `node_modules/@clerk/expo/node_modules/@clerk/shared/dist/types/` rather than remembered — never the legacy `prepareFirstFactor` / `setActive` sign-in flow. Mirrors gridgo-supplier's `lib/clerkIdentity.ts`; fix a fleet-wide identity problem in all three apps. The photo needs `expo-image-picker` (a native module). **Never statically import it** from this file or from anything Your details loads: a USB binary built without it throws `Cannot find native module 'ExponentImagePicker'` at import time and the whole screen dies. Lazy-require on tap (`getImagePickerNative`); if the module is missing, say a rebuild is needed (`PORTRAIT_NEEDS_REBUILD`) and keep the rest of the details — and Clerk's `imageUrl` — on screen. A rebuilt binary (`npx expo run:android`) is what actually opens the picker.
- **The order flow is matched, not browsed.** A client ranks quality, speed and distance once (`lib/priorities.ts`, saved on the account through `GET|PUT /me/preferences`), and every job after that is matched to **one** shop by `POST /me/matches`. `lib/match.ts` reads that answer back: the queue is `jobsAhead + 1` and is real (GRIDGO counts live jobs at that shop), and the card's reason line is written from the structured `reasons`, never from their `detail` strings — those are working notes ("88% listing completeness") and must not reach a screen. `POST /me/matches/next` walks past the match with every shop already seen. The matcher **refuses without a drop-off when distance is ranked first**, so `hooks/useStartPrintJob.ts` asks for the address first and `app/request/match.tsx` redirects on `dropoff_required`.
- **Listing samples load through `samplePhotoUri` (`lib/listing.ts`) only.** Match, listing sheet, checkout and `MatchedShopCard` must use that helper — it returns the signed `downloadUrl`. The relative `url` (`/catalog/media/:fileId`) is metadata, not image bytes; feeding it to `SamplePhoto` is how the match row painted an empty "No sample" plate.
- **The basket lives on GRIDGO, not the phone.** `store/cart.ts` persists only the cart id; the lines, prices, drop-offs and state all come from `/me/carts`. `lib/basket.ts` reproduces checkout's arithmetic — `roundBps`, the distance bands, the farthest drop per shop — so the sheet and the invoice agree; where a figure cannot be known yet (no pin, so no band) it is `null` and the sheet says so rather than showing a number that will move. Two API shapes are easy to get wrong: `label` on `POST /me/addresses` is capped at **80** characters, and switching `serviceLevel` to `scheduled` **must** carry a `scheduledFor` or it is `400 invalid_schedule`.
- **Checkout is QR Ph, a reference and a receipt.** `POST /me/carts/:id/checkout` takes `{method:"qr_manual", reference, proofFileId}` and nothing else; the screenshot is a `payment_proof` upload (`hooks/usePaymentProof.ts` — images only, 15 MB, a different limit from artwork). It writes the order at `needs_qa` with the 75/25 split already submitted, so the order screen shows "In artwork check" and asks for nothing. Note those payments are keyed `initial` / `final_online`, **not** the `downpayment` / `balance` that `lib/payment.ts` and `components/PaymentPanel.tsx` still expect — that gap only bites when one of these orders becomes payable.
- **Multi-drop is not a third fulfilment mode.** The platform has `delivery` and `pickup`; a multi-drop is a delivery whose lines carry their own `dropoff` (`PUT /me/carts/:id/dropoffs`). `lib/checkout.ts` keeps it a separate choice on the sheet, because to a client it is a different decision, and converts it on the way out. Express is listed and refused for the same reason COD is named and refused: a client who cannot find a thing assumes the app is broken.
- `lib/shopBoards.ts` — the public catalog is two calls deep (shops, then each board), and both the category screen and the match screen want the same answer seconds apart, so it is cached for a minute. The category screen's "shops are printing these" split is read from those boards, never guessed from the platform catalog.
- `lib/orderSteps.ts` + `components/StepTrail.tsx` — where one basket run stands: Shop → Listing → Artwork → Pay, drawn on listing, artwork and checkout. Named, never numbered — `RequestStepper` numbers the legacy four-step form, and two numbered four-step bars counting different things is worse than either. The current step is the bar's one yellow (the stepper exemption in the yellow rule), so the screen under it keeps its own primary action. Where a finished step goes back to is `lib/orderFlow.ts`: the match screen's category/subcategory held in memory the way `lib/listingCache.ts` holds a listing, rather than threaded through four screens as params. No run in memory → the category screen, never a guessed shop.
- `lib/swipeRow.ts` — swipe-to-remove thresholds for a basket line. A flick **opens** the row; only a long drag reaches `commit`, and `commit` still only *asks* (`ConfirmDialog`). Swiping is not an accessible gesture, so `components/SwipeToRemove.tsx` also carries a real `remove` accessibility action, and it claims the gesture on the **capture** phase — the whole row is a Pressable that opens the listing, so bubbling alone never takes the touch back from it.
- `lib/orderStages.ts` — the four coarse stages (Order, Printing, Dispatch, Delivered) the legacy app drew on every notification. Unknown state → `null` → no rail, never a guessed position
- `lib/requestValidation.ts` — stepper validation; artwork passes only on a server-issued `fileId`
- `lib/taxonomy.ts` + `lib/zones.ts` — materials and finishes come from `GET /taxonomy`; a zone is a named part of Davao and **carries no fee**. Delivery is priced by distance bands in `GET /settings`, from the assigned supplier's shop, so it does not exist until a supplier does. Never hardcode a material or a delivery fee. An order can store a taxonomy *code* rather than a name (`hem_grommet` reached a client's screen that way) — render it through `taxonomyLabel`.
- `lib/productCategories.ts` — the **customer-facing** product tree (four categories, seventeen subcategories, each with the audience and example text a client recognises themselves in). A different thing from `lib/taxonomy.ts`, which holds the *production* categories that gate materials and finishes. Read it through `api.getProductCategories()`; `adaptProductCategories` is a deliberately forgiving reader over `GET /taxonomy` because the API contract had not landed, and falls back to `data/productCategories.ts`. **Narrow the field-name aliases and delete the seed once the API publishes the tree.** A subcategory maps to catalog *families*, so it becomes orderable the moment Operations prices one — a subcategory with no family is shown as quoted by Operations, never as a button that leads nowhere.
- `lib/sizes.ts` — the one pick list the client owns (the platform has no size taxonomy). Custom is allowed only where the trade cuts to order, and is marked as custom.
- `lib/deadline.ts` / `lib/quantity.ts` / `lib/address.ts` — bounds and wording for the date-time picker, the quantity stepper and the structured address. `checkAddress` requires street/building only; `composeAddress` is line1 + optional landmark + Davao City. Barangay is not asked for. `parseAddress` still reads an old barangay segment so reorders keep the line.
- `lib/geocode.ts` + `lib/deviceLocation.ts` + `lib/savedPlaces.ts` — drop-off search is OpenStreetMap Nominatim only (Davao viewbox, 1 req/s, `GRIDGO-client/<version>` User-Agent). **Use my location** asks `expo-location` on tap, never on mount; denial is a line of copy, never an invented pin. Saved Places (Home / Work / named) live on Account (`app/saved-places.tsx`); checkout still sets the pin through `app/request/where.tsx`. Live `gridgo-api` has GET/POST `/me/addresses` only — no client-side delete.
- `lib/artworkUpload.ts` — upload phases and error copy. **Transfer progress is not success**: only a `201` carrying a `fileId` reaches `stored`.
- `lib/tracking.ts` — staleness, remaining distance, and the lat/lng ↔ GeoJSON `[lon, lat]` boundary. GRIDGO publishes no ETA; do not invent one.
- `lib/mapHtml.ts` + `lib/osrm.ts` + `components/DeliveryMap.native.tsx` — the map stack, mirroring the same-named files in **gridgo-rider**. See "Maps" below.
- `lib/issueWindow.ts` — the window's length is `issueWindowHours` from `GET /settings`, never a constant, and under v2 it genuinely expires: the platform stamps `issueWindowExpiresAt` and closes it, so remaining time is honest to show
- `lib/productPreview.ts` — template map; mockup label is fixed here
- `lib/chatThreads.ts` — who a client can message (supplier, rider, Gridbot) and, while there is **no message backend**, when each conversation would start. Chat is a placeholder: never seed a transcript, never draw an unread dot, never show an avatar or photo. `CHAT_NOT_LIVE` says messaging is not switched on rather than letting "no messages yet" read as a thread that is merely quiet — the same honest-state rule as everywhere else. `app/chat/index.tsx` + `app/chat/[thread].tsx` are header-only routes, not a tab, and the thread has no composer, because a disabled input is a control nobody can use. When a backend lands, the copy goes and the module stays.
- `lib/persistStorage.ts` — required Zustand persistence boundary: use AsyncStorage in native/real-browser runtimes and inert storage only when `typeof window === "undefined"` during SSR; never gate persistence on `Platform.OS`
- `lib/navigationHeaders.ts` — **every pushed root-stack screen goes through `pushedScreenOptions("<title>")`**, which does two jobs. It sets `headerBackButtonDisplayMode: "minimal"` — the bare chevron the captain asked for, and the thing that stops iOS writing the previous screen's title (`(tabs)`, or one origin's name) on the control. A screen whose header is hidden still needs a `title`, because that is what a pushed child's back control falls back to. And it *requires* a title: the band is drawn at full height whether or not anything is in it, so `title: ""` spent a header's height on a chevron and nothing else (the reported "empty space above the heading"). Pick a title that does not repeat the screen's own heading; both request screens say "New request" because they are two screens of one flow. `lib/__tests__/pushedRouteLayout.test.ts` reads `app/_layout.tsx` and fails if a new route skips either half.
- **A screen under a visible header never sets `edges={["top"]}`.** The header has already cleared the status bar and the prop is *additive*, so a second inset is a notch's worth of blank canvas — invisible on Expo web, where insets are zero, and ~47pt on the phone. Pushed screens use `edges={["bottom"]}`; only the tab screens and full-bleed routes own their top edge. Same test pins it.
- **Never `router.replace` onto a root-stack sibling from inside `(tabs)`.** The root stack's only entry is the tab shell, so `REPLACE` swaps it out: no tab bar, no back control, only OS gestures. Switch tab then `push` (see `sendRequest` in `app/(tabs)/new-request.tsx`). Any screen reachable by deep link also needs its own escape when `!router.canGoBack()` — `app/order/[id].tsx` sets a `headerLeft` for it.
- `components/Skeleton.tsx` — placeholder shapes with a highlight **sweep** (~1.1s), the loading language the legacy app used. Ambient loading, not a transition: the 160–240ms budget governs transitions, and an opacity pulse inside it would strobe. Reduce motion drops the sweep and keeps the shapes. Shape the composition like the screen it becomes (`SkeletonOrderCard` on Orders, `SkeletonHomeDocket` on Home) — a wrong-height placeholder is the "it jumps" bug. `components/LoadingOverlay.tsx` is the other case: work that blocks a screen already on display.
- Tab screens pad their scroll content with `tabScreenContentPadding(insets.bottom)`. The bar floats over the scene, so a flat `pb-*` puts the last control underneath it.
- `lib/sessionGuard.ts` + root `app/_layout.tsx` — Expo Router `Stack.Protected` guards the signed-in root stack (`(tabs)`, `order/[id]`, `design-system`, `settings`, `saved-places`, `saved-place`). Session clear (logout / 401 / rejected role) alone returns to login; do not scatter `router.replace` at call sites. `app/index.tsx` is launch-only mapping.
- `lib/onboardingExit.ts` — explicit onboarding dismiss targets (`returnTo=settings` vs first-launch). Do not rely on history alone for Settings replay.
- Onboarding pager is full-height over the content area (art behind, `pointerEvents="none"`) so swipes work over the illustration; parallax stays outside the pager.
- Account holds identity + Sign out; theme and “View onboarding” live on `app/settings.tsx`.
- `components/StartPrintFab.tsx` + `components/TabScreen.tsx` — the yellow "+" floats on the bottom-right of Home, Orders, Notifications and Account (Strava-style disc over the scene, not a fifth tab). `lib/startPrint.ts` owns where it lands. The stepper stays a hidden tab route.
- `components/GridgoTabBar.tsx` — geometry is per platform and both halves were captain reports. The bar is four destinations; there is no centre plus. iOS gets the HIG's **49pt** content row (83pt with the home indicator, exactly UIKit); Android gets Material 3's **80dp** container (`NavigationBarTokens.TallContainerHeight`; the 64dp `ContainerHeight` is the short/expressive bar, not this one). Where the platform reserves a bottom inset, **that inset is the whole breathing room** — adding a design pad on top of 34pt is what "the tab bar sits too high" was. The design gap is a **floor under** the inset, never a zero-check: a `> 0` test gave a device reporting 2dp *less* room than one reserving nothing. Two facts people keep re-deriving wrongly, both checked against source rather than memory: MD3 puts the system inset **beneath** the 80dp container (androidx `NavigationBar` applies `windowInsetsPadding` *outside* `defaultMinSize`, and `InsetsPaddingModifier` reports `child + inset`), so 80 + 48 = 128dp on three-button is Material's own answer and not a double-count; and under Expo's edge-to-edge Android the bottom inset is **always real** (~48dp three-button, ~24dp gesture) — "no inset" means Expo web or a pre-indicator iPhone, never an Android phone. `tabBarPaintedHeight(platformOS, insetBottom)` is the whole table as one pure function; assert against it. Columns keep a `minHeight`, never a rigid height, or the badge has no slack. Keep the three apps identical.

  **Measure the top gap from the paint, not from the layout box.** This app and gridgo-rider draw a raised action disc, so the surface is painted `actionRise` below the top of the bar's layout box and only the action column reaches up into that strip; gridgo-supplier has no disc and paints edge to edge. Item padding measured from the layout top therefore bought `actionRise` less room here than there — the captain's "items sit too close to the top edge", and on iOS the 49pt stack fills its column exactly, so the glyph sat 6pt *above* the paint. `tabBarTopGap(platformOS)` is that space, and it is now gridgo-supplier's: **4pt on iOS, 20dp on Android**. Do not close the gap by shrinking `actionRise` — that number *is* the overhang. `tabBarHeight` is the layout box (painted bar + strip); `tabScreenContentPadding` clears it.
- `components/HeaderIconButton.tsx` — the 44x44 control in a screen's header row. Cart and Chat sit side by side on Home and are read as a pair, so geometry, glyph size and the count badge live here once; `CartButton` and `ChatButton` are labels over it. Monochrome including the badge: Home's yellow is the tab bar's "+" one row below, and a second yellow thing in the same thumb's reach is how a screen stops having a primary action. Pass `count` only where there is real data to count. Pin the badge to the glyph, not the hit target, and set the numeral in `style` (`accent` fill, `accentOn` type, canvas ring) — NativeWind on that overlay dropped the ink and left a white 1 on a white disc.
- `components/GridgoLogo.tsx` — mark + wordmark + optional role lockup (`GridgoLogoRole`). Client uses `logoRoleForClientAccount(user.accountType)` only — never infer from `orgName`. Signed-out surfaces stay plain GRIDGO (no flash). Identity surfaces only: login, onboarding, home header. **Layout rule:** the mark sits left and stands as tall as the whole text block; the wordmark and role stack in a column beside it. Never a mark/wordmark row with the role hung underneath — that caps the mark at one line and has been rejected twice. All geometry is derived in `gridgoLockupMetrics`, and `size` means the plain lockup's mark edge, not the rendered height.
- `app/request/category.tsx` + `app/request/[category].tsx` — choosing what to print. This sits **ahead of** the four-step stepper, not inside it: the stepper specifies a job already decided on, and a reorder skips the choice entirely. The tab bar's yellow "+" is the app's one start-a-request control and routes here when nothing is chosen (`app/(tabs)/_layout.tsx`) — do not add a second start button to a screen.
- `lib/listingCache.ts` — match already returned the listing; the sheet paints from that cache and does not `GET /catalog/items/:id` (signed photos) while it is fresh. A stale cache still paints first; the refresh is background and must not blank the sheet. Compact cart-line mutations omit photos; `hydrateCartListings` puts the cached sheet back on the line so artwork still has formats.
- `store/cart.ts` — the basket lives on GRIDGO; only its id is on the phone. `ensure()` shares **one** in-flight `POST /me/carts` so a warm-up and the tap that overtakes it cannot each create a basket and drop the first item in the loser. `warm()` is that create started from the listing sheet while the client is still ticking options — "Add to my order" was two round trips and is now one, which is the whole of the reported "Saving…" hang. Never re-read the cart after a mutation: the response *is* the basket. Line add/save navigates as soon as the line id exists.
- `store/requestDraft.ts` — in-progress request (Zustand + AsyncStorage)
- `store/theme.ts` — system/light/dark preference persistence
- `store/notifications.ts` — cache-first inbox. Persist `items` + `snapshot` and an optimistic `readIds` overlay; `refresh()` does not flip `loading` over a list already on screen. Mark-read is `PATCH /notifications/:id` `{ read }` and mark-all is `PATCH /notifications/read-all` `{ snapshot }`. `GET /notifications?limit=40` returns `orderTitle`/`orderState`, so the stage rail does not wait on `GET /orders`. A hung list becomes an error, not an endless skeleton.

### Push notifications

The third delivery leg, beside `GET /notifications` and the SSE stream: the server sends the same notification record through **FCM HTTP v1** so it arrives with the app closed. `docs/OPERATIONAL_MODEL_V2_API.md` → *Push notifications* in **gridgo-api** is the contract — read it before touching `/devices` or the logout body. The shape here is the one gridgo-supplier and gridgo-rider copy: `lib/push.ts`, `store/push.ts` and `hooks/usePushNotifications.ts` are reusable as they stand, and only `pushTargetRoute`, the copy in `pushOfferCopy`, and where `PushEnableCard` is drawn are this app's. **Fix a fleet-wide push problem in all three apps, not one.**

- **`google-services.json` is never committed.** It is the captain's, covers all three packages from project `gridgo-c2ce9`, and reaches a build as configuration: `GOOGLE_SERVICES_JSON` names a path, or a copy dropped in the repo root is found. Absent, `app.config.ts` omits the key and the app runs with push simply unavailable — which is what keeps `expo start`, `tsc`, jest and `expo config --type public` working on a machine that has never seen the file. A path that is *named* and missing throws, because the alternative is a green build that installs and never receives anything. The release workflow stages it from `GOOGLE_SERVICES_JSON_BASE64` and asserts it carries an entry for `ph.gridgo.client` before prebuild; `__tests__/releaseWorkflow.test.ts` and `__tests__/appConfigFirebase.test.ts` pin both halves. **Never hand-edit Gradle for this** — the Expo plugin writes the `com.google.gms.google-services` wiring and copies the file into `android/app/` during prebuild.
- **The channel `gridgo_default` must exist before a token is requested.** Android 8+ downgrades or drops a message naming a channel the app has not created, and the Android 13 permission dialog does not appear until *some* channel exists. `store/push.ts` creates it ahead of every permission read for that reason, and the ordering is asserted.
- **The permission is asked once and a refusal is effectively permanent.** So nothing in the app may call `requestPermissionsAsync` on launch; the only caller is a tap on `components/PushEnableCard.tsx`. That card is drawn on signed-in surfaces: the Notifications tab and an order waiting on somebody else. **Login must not import it** — Expo Go Android SDK 53 throws when `expo-notifications` is first imported, and the card pulls in `store/push`. Once blocked, `Linking.openSettings()` is the only honest offer — the app cannot raise the dialog again.
- **Registration does not wait for a session.** A granted phone registers **unclaimed** at launch (`api.registerDeviceUnclaimed`) and signing in claims the same token through the ordinary `POST /devices`. Sign-out sends `{deviceToken}` on `POST /auth/logout` and then re-registers unclaimed (`usePush.release`): signing out is not uninstalling. `pushOffer` still returns `ask` to a signed-out phone — and *only* `ask`, never "you are blocked" or "registration failed" — so a future public surface can draw the card without inventing a new rule. The login screen itself does not.
- **`api.registerDeviceUnclaimed` is provisional and deliberately bypasses `request()`.** A deployment without the anonymous route answers `401`, and routing that through `request()`'s unauthorized handler would **sign a customer out because a provisional route is not live**. So it does its own `fetch` with no bearer, and `store/push.ts` treats `401`/`403`/`404`/`405` as not-open-yet — no error, nothing shown, and the phone registers for real at the next sign-in.
- **Register only when granted, and re-register on every launch and every rotation.** `POST /devices` is idempotent by contract and moves a token that belonged to another account, which is what a shared handset produces. A token Firebase quietly reissued is the usual reason push stops arriving with nothing visibly wrong, so `addPushTokenListener` is not optional.
- **The device token goes with `POST /auth/logout`, not to `/devices/unregister`.** After sign-out the bearer token is dead, so a phone that signed out first could no longer authenticate an unregister and would keep waking for the previous person's orders. Logout then **releases** the row (it does not delete it) and `usePush.release` puts the phone back on the unclaimed list.
- **A foreground push shows nothing** (`PUSH_FOREGROUND_BEHAVIOR`). It is the same record the open list and its badge already carry; a banner over it is the same news twice. The arrival is spent refreshing the list instead.
- **Expo Go cannot do any of this.** Expo removed Android remote push from Expo Go in SDK 53 and the module *throws at import time*, not at `getDevicePushTokenAsync`. Never statically import `expo-notifications` from a module that loads at launch or on public auth (`store/push.ts`, `hooks/usePushNotifications.ts`, login). `getNotificationsNative` skips Expo Go and treats a failed require as "push is off". A throw costs push, never the app. Push is only observable in an installed development or release build — `npx expo run:android` for the USB debug client, or `npx expo prebuild --platform android` + `./gradlew assembleRelease` then `adb install` for a release APK. `expo prebuild` rewrites `package.json` `android`/`ios` to `expo run:*`: `android` is already that on purpose, keep `start` as `expo start --dev-client`, and revert `ios` if you only prebuilt Android.
- The payload's `data` map is an allowlist of exactly `notificationId`, `type`, `orderId`, `at`, all strings, with valueless keys omitted — **no money or supplier-only field can ever reach a lock screen**. It carries no order state, so a tapped screen still fetches. An unknown `type` opens the notification list; never guess a screen from a string added after this build shipped.
- **A release build cannot reach a plain-HTTP API, so a local API needs one extra step to test against.** Expo puts `usesCleartextTraffic="true"` in the *debug* manifest only; a release APK pointed at `http://10.0.2.2:<port>` reports the API unreachable and every screen fails with it. This never affects a shipped build — `EXPO_PUBLIC_API_URL` is the deployed HTTPS origin — so do **not** "fix" it in `app.json`. To prove something against a local API from a release build, add `android:usesCleartextTraffic="true"` to the `<application>` tag in the *generated* `android/app/src/main/AndroidManifest.xml` and rebuild; `android/` is gitignored, so nothing follows you into a commit.
- **A notification tap opens the right order only while the app still holds a session** — verified on device, and the cold-start case is a known gap. The session lives in memory (`store/session.ts` does not persist), so a tap that starts a dead process lands on sign-in. `usePushNotifications` stashes the target and spends it when a session appears, rather than pushing into a route the guard would bounce; **in the one cold-start run observed, that deferred push did not land — sign-in went to Home.** The likely cause is that `Stack.Protected` swaps the root stack's children in the same commit that flips `signedIn`, so a `push` issued then is discarded. Persisting the session would remove the situation entirely and is the change worth making; either way, re-test that path on a device rather than trusting the mechanism.

### Files and proofs

`docs/STORAGE_API.md` in **gridgo-api** is the authoritative contract for uploads — read it before touching `POST /files`, `attach`, or `download-url`. Client-side consequences that are easy to get wrong:

- Upload with `XMLHttpRequest` (`lib/api.ts` `uploadFile`), never by reading the URI into memory. A 200 MB artwork must stream, or mid-range Android runs out of memory. iOS reports unreliable MIME types — send what the picker gave and let the server decide from magic bytes.
- New request order: create the order as a **draft** → attach the file → transition to `submitted`. Operations must never open a job whose artwork has not landed.
- The client sees **two** proof decisions at different points: `proof_approval` (Operations' artwork proof, before matching) and `supplier_proof_review` (the supplier's print proof, before payment). Both are `isAnyProofDecisionState`.
- A QA rejection is `client_correction` → replace the file on the **same order** → `submitted`. Never create a second order; the quote, history and payment survive.

### Maps

Every GRIDGO app runs **one** map stack: **Leaflet over OpenStreetMap tiles inside `react-native-webview`, with OSRM for the route line.** Keep `react-native-webview` on the same version as gridgo-rider.

**Do not reach for `react-native-maps` or `expo-maps`.** On Android `react-native-maps` *is* Google Maps: it needs a Google Maps API key and a billing account, and without one the client sees a blank grey rectangle on a physical phone. This has been decided; a PR that reintroduces it will be sent back.

- `lib/mapHtml.ts` builds the whole Leaflet document. Model changes are pushed into the live page with `injectJavaScript`; only a theme flip rebuilds the HTML, so the tile set swaps cleanly. Drop-off uses the **gridgo-rider** teardrop (`PIN_PATH`, `iconAnchor` on the tip ~`[17, 45]`, contact shadow) in the client skin (white fill `#FFFFFF`, charcoal stroke `#1a1a1a`). Yellow stays off this pin — it is the client's door, not a shop. `PinPicker` sets a search / Use-my-location pin with `setExternalPin` / `externalPinScript` — do not reload tiles on every update. Tap-to-move stays. Do not add Google Maps or Places; Nominatim is the search.
- Leaflet is loaded from unpkg with `integrity="sha384-…"`. Bump the version and you must recompute both hashes, or the map silently stops loading. The command is in the comment above the tags.
- OSM tile attribution is a licence condition. Never hide it.
- `lib/osrm.ts` uses the free, keyless, rate-limited public OSRM demo. **Treat failure as normal** — it falls back to a straight line and says so. Nothing on a tracking surface may block on it.
- OSRM path order is `lon,lat`. Reversed, Davao lands in the ocean. `lib/tracking.ts` owns the conversion; convert only at the network/HTML boundary.
- OSRM also returns a travel time. The client deliberately does **not** show it: GRIDGO publishes no ETA, and a routing engine's guess next to a delivery reads as a promise nobody made.
- `components/DeliveryMap.tsx` is the web fallback. `react-native-webview` has no web build and renders its own red "does not support this platform" string — an internal message that must never reach a client.

### Sheets and modals

Two mechanisms, chosen by what the content is:

- **A route** presented as the platform's own form sheet — `presentation: "formSheet"` with `sheetAllowedDetents: "fitToContents"` in `app/_layout.tsx`, as `app/order/request-changes.tsx` does. Use this whenever the content is a real destination, especially one with an input: drag-dismiss, the back gesture and focus containment all come from the platform. Guard unsaved work with `usePreventRemove`, which catches every in-app dismissal path. Keyboard avoidance is **half** platform, so read the comment on that screen before touching it: react-native-screens lifts a form sheet off the IME on Android (`SheetDelegate.onApplyWindowInsets`) and nothing lifts it on iOS, where `behavior="padding"` against a `fitToContents` detent is what raises it. Adding padding on both would lift it twice.
- **`components/Sheet.tsx`** for a reusable form control whose options are computed by its caller (`OptionPicker`, `DateTimeField`) — routing those would push option lists through URL params. Physics live in `lib/sheet.ts` and are unit-tested; the drag uses `PanResponder`, **not** react-native-gesture-handler, because RNGH resolves its root through the view tree and a React Native `Modal` renders outside it, so a `GestureDetector` in there silently never fires. `GestureHandlerRootView` **is** mounted at the root of `app/_layout.tsx` — the deadline calendar's month strip is dragged, and tracking a finger from the UI thread is what makes it a page being turned rather than an animation played afterwards. Everything drawn inside a `Modal` still has to use `PanResponder`.

Never hand-roll a `<Modal animationType="slide">` again — a fixed ramp that ignores the finger is what "the modal slide is not optimized" described. A centred `ConfirmDialog` is still correct for a one-question alert; its scrim dismisses a routine confirmation but never a destructive one.

**Expo web cannot exercise any of this.** React Native Web's responder system does not reach inside a `Modal` portal, so no drag library receives events there. Sheet gestures are a device check, not a web check — and so is everything under "Keyboard", below: a browser has no soft keyboard.

### Keyboard

**Every screen that takes typed input opens through `components/FormScreen.tsx`.** It is the shared `Screen` shell around `KeyboardAwareScrollView` from `react-native-keyboard-controller`, with `KeyboardProvider` at the root layout. Do not wrap forms in a measuring `SafeAreaView`: that reports 0 on the first frame of a push and is the header flick. `components/__tests__/keyboardCoverage.test.ts` reads the sources and fails if a route renders a field — its own, or one of the components that carries one — outside the shell.

- **Never import `KeyboardAvoidingView` from `react-native`.** The same test bans it. It pads or shrinks a container and never scrolls, so on a form longer than a phone the caret stayed under the keyboard while the space appeared below it; it takes a different `behavior` per platform; and on Android it does nothing at all now that Expo's edge-to-edge (mandatory from SDK 54) stops `adjustResize` resizing the window. Both halves of the captain's "typing covers the field" were that.
- **`gg-field` owns the shell, never a `TextInput`'s horizontal padding.** NativeWind `px-*` can fail to reach Android's inner EditText or override a native style depending on merge order. `components/form/TextField.tsx` and `PasswordField.tsx` put the typesetting margin on `paddingStart` / `paddingEnd` (**16**, not 28), disable Android font padding, and own vertical alignment; `components/form/__tests__/fieldInsets.test.tsx` pins the native styles. Non-input picker/date shells add their own `px-6` at the concrete control.
- `react-native-keyboard-controller` is in Expo Go's bundled modules for SDK 54, so this needs no development build. Install it with `npx expo install` so the version stays the one Expo Go ships.
- Pass no `statusBarTranslucent` / `navigationBarTranslucent` to `KeyboardProvider`: the library detects edge-to-edge and warns when they are set.
- Where the content is a sheet rather than a scroll, use the library's `KeyboardAvoidingView`. It works inside a React Native `Modal` (since 1.13), which is what `components/Sheet.tsx` needs.
- On web every binding in the library is a documented no-op, so `FormScreen` is a plain `ScrollView` there and the whole thing degrades honestly. It also means **keyboard behaviour cannot be checked in a browser** — verify on a device.

### Honest-state rules that keep being re-broken

- Rider location comes from `GET /dispatch/:id/location` and is often `{ ping: null }`. Say so; never render an empty map as if it were current.
- **Submitting a payment reference is not paying.** `POST /orders/:id/payments/:installment/submit` returns `200` for "with Operations for checking". Nothing may read as paid until the status is `confirmed`, and "we are checking your payment" is a real state a person sits in — give it a card, not silence.
- **A price is a range until a supplier accepts.** Before that, `priceRange` is all there is and delivery does not exist, because it is priced from a shop nobody has chosen. Never compute a total from the catalog to fill the gap.
- `POST /orders/:id/issues` is refused unless the order is in the issue window, and refuses a second open report with `issue_already_open`. Map both to plain language in `lib/copy.ts`.
- The delivery fee is the distance band's, from the API, and only after a supplier is assigned. A constant in the app will disagree with what the client is charged.
- **A client collects at GRIDGO Office, never from whoever printed it.** "You collect from the shop counter" sends a person to the wrong address, and a map pin on the shop hands out an address GRIDGO answers for. See `lib/gridgoOffice.ts`.

## Running and testing

- Day-to-day Android is a **USB development build** (`expo-dev-client`), not Expo Go. `npm start` is `expo start --dev-client`; `npm run android` is `expo run:android`. Push and `gridgoclient://` returns need that binary — Expo Go Android SDK 53 throws if `expo-notifications` is imported. Keep port/LAN flags out of `package.json`; this app's Metro is **8081**. Local prebuild / `expo run:android` must export `GOOGLE_SERVICES_JSON` to the captain's file (never copy it into the repo).
- `npx tsc --noEmit`, `npx jest`, `npx expo lint` all have to be clean.
- **Expo web boots only because `metro.config.js` resolves zustand through its CommonJS build.** zustand serves native the CJS build via the `react-native` export condition and everyone else an ESM build whose devtools middleware reads `import.meta.env`; Metro emits web as a classic script, so that is a syntax error that kills the *whole* bundle with one console line and a blank page. Session, theme and the request draft all import `zustand/middleware`, so this is not an edge case.
- Metro's file watcher does not reliably pick up edits in a git worktree here. If a screen looks stale in the browser, restart the dev server rather than doubting the change.
- `@testing-library/react-native` 14 on React 19 returns a promise from `render`. **`await` it**, or `screen` stays empty and every query fails with "render function has not been called".
- `*ByLabelText` only matches **accessibility elements**. A `Pressable` is one automatically; a labelled `View` is not until it carries `accessible`, and the query fails while `screen.debug()` plainly shows the label. Adding `accessible` is the right fix rather than the test working around it — it is also what makes the label one announcement instead of a silent stop per child.
- jest-expo still mocks the `ImageLoader` native module in the **old callback shape** while React Native 0.81 calls the promise one, so any screen that measures artwork with `Image.getSize` throws `success is not a function` from a `nextTick` — outside every promise chain the screen could catch. Stub `Image.getSize` in that screen's test (`app/__tests__/artwork.test.tsx`).
- Same combination, more traps worth knowing before you spend an hour on them. A `fireEvent.changeText` does not land before the next synchronous `fireEvent.press`, so a form submitted in a test reads an empty form — `await waitFor` on the last field's value first. **A test that presses twice empties every later `render` in that file** — the tree comes back with nothing in it, no error, and a bare `<Text>` will not render either. It is not about stores: two plain `fireEvent.press` calls on two `jest.fn()` handlers are enough, and an async store update through one press does it too. So **one press per test, and any test that must press twice goes last in its file**; a whole login attempt (two `changeText` plus a press) spends the file, which is why `app/__tests__/login-*.test.tsx` is one interacting test per file. A lone `useState` write after those events is dropped the same way — a store write in the same position re-renders, so put an error the person must see behind one (or inside a handler that has already written to a store, as login's busy envelope does); a second such test needs its own file (`app/__tests__/signup.test.tsx` / `signup-error.test.tsx`, `checkout.test.tsx` / `checkout-remove.test.tsx`, and the ordering comment in `components/__tests__/StepTrail.test.tsx`). The same combination also **drops a plain `useState` update made from an async continuation** — the setter runs, the tree never re-renders, and `act`/`rerender` do not recover it, while a Zustand write in the same position does re-render. That is why a multi-step auth screen keeps its step in a store (`store/loginFlow.ts`, `store/signupFlow.ts`) rather than local state; it is the only way the code step is reachable in a test at all. Two more, both from the Account rebuild. A press that *does* land still re-renders **asynchronously**, so `expect` on the new UI directly after `fireEvent.press` fails while `await screen.findByText(...)` passes — a store is not the fix there, awaiting is. And **a screen that writes to a store from an effect on mount spends the same budget without a single press**: Account re-reads `/me` on focus, and the fourth test in that file came back empty even with the read settled per test, which is why it is split across `account.test.tsx`, `account-navigation.test.tsx` and `account-signout.test.tsx`.

## Development Philosophy

Build feature by feature.

For every feature:

1. Read this file first.
2. Keep the implementation simple.
3. Avoid overengineering.
4. Prefer readable code over clever code.
5. Build the smallest useful version first.
6. Refactor only when repetition appears.

---

## Decision Making

If something is unclear or could be improved, suggest a better approach. If a new library would significantly help, recommend it, explain why, and ask before adding it.

Do not install new libraries without approval.

---

## Architecture

Use this folder structure:

```
app/
  (auth)/
  (tabs)/
components/
constants/
data/
hooks/
lib/
store/
types/
assets/
```

**app/** is for routes and screens only. Screens compose components and call hooks or stores. They should not contain large reusable UI blocks or business logic.

**components/** is for reusable UI. Create a component when it is reused in multiple places, when it makes a screen easier to read, or when it represents a clear UI concept. Examples for this app: `PrimaryButton`, `SecondaryButton`, `StatusChip`, `RequestStepper`, `ProductCard`, `SpecRow`, `ArtworkUploadCard`, `ProofViewer`, `TrackingMapCard`, `RiderContactCard`, `CountdownTimer`, `EmptyState`. Do not create components too early.

**data/** holds hardcoded content. Keep it typed.

**store/** holds Zustand stores. Examples of state to keep here: session, theme preference (`system` | `light` | `dark`), the in-progress print request draft (product, size, material, quantity, deadline, address, uploaded artwork), cart/reorder items, order list and selected order, active delivery tracking as received (rider location, ETA, last-updated timestamp, stale flag), and the unread notification count. Persist with AsyncStorage when needed — theme preference, session, and the request draft are worth persisting. Never persist rider location or ETAs; they are someone else's live data and go stale the moment the app is backgrounded.

**lib/** holds external service helpers (clerk.ts, api.ts, cn.ts). Never expose secret keys here.

---

## UI Rules

For any UI task:

- Replicate the provided design exactly.
- Match layout, spacing, padding, font sizes, font hierarchy, colors, border radius, shadows, alignment, and proportions.
- Do not approximate. Do not simplify unless explicitly asked.

---

## Design Tokens

This section is the source of truth for GRIDGO's visual system. When a mockup is provided for a screen, replicate it exactly — the tokens below are what it is built from.

Define tokens once in `constants/theme.ts` and consume them by semantic name. Never hard-code a hex value in a screen or component.

### Color

| Token | Light | Dark | Use |
|---|---:|---:|---|
| `canvas` | `#F8F8F8` | `#000000` | Screen background |
| `surface` | `#FFFFFF` | `#141414` | Cards, sheets, navigation |
| `surfaceVariant` | `#F0F0F0` | `#1E1E1E` | Inactive panels, grouping |
| `surfaceHigh` | `#FFFFFF` | `#2A2A2A` | Selected/elevated panel |
| `textPrimary` | `#1A1A1A` | `#F0F0F0` | Headings and core data |
| `textSecondary` | `#4A4A4A` | `#CCCCCC` | Supporting text |
| `textMuted` | `#7A7A7A` | `#808080` | Metadata, inactive labels |
| `outline` | `#DCDCDC` | `#2E2E2E` | Cards, fields, dividers |
| `outlineSubtle` | `#EEEEEE` | `#1E1E1E` | Quiet divider |
| `accent` | `#1A1A1A` | `#F0F0F0` | Monochrome structural control |
| `accentOn` | `#FFFFFF` | `#000000` | Text/icon on accent |
| `brand` | `#D4A017` | `#FFDE58` | Small links and badges, "View all" |
| `actionYellow` | `#FFDE58` | `#FFDE58` | Primary CTA, current step, active nav, map route |
| `success` | `#2E7D32` | `#66BB6A` | Approved, completed |
| `error` | `#C62828` | `#EF5350` | Blocked, failed |
| `warning` | `#F57F17` | `#FFCA28` | Risk, attention |
| `info` | `#1565C0` | `#42A5F5` | Informational, support |

### The yellow rule

`actionYellow` is a finite attention budget, not a brand fill. This is the rule most easily broken and the one that most changes how the product reads.

- One primary CTA per screen or bounded panel. Nothing else.
- Also allowed: the active stepper step, the selected bottom-nav item, and the map route/highlight.
- Navigation, secondary buttons, filters, inputs, tabs, and routine controls stay black/white/charcoal.
- Yellow buttons use black text and a clear verb.
- No yellow page backgrounds and no large black slabs in Light. In Dark, cards must stay visibly elevated from the canvas — never let a surface disappear into black.

### Status

Color never carries meaning alone. Every status is **icon + label + color**: "Approved", "Blocked", "Needs correction", "Last updated 3 min ago". A screen must stay fully readable in grayscale.

### Type

Satoshi for all UI, falling back to `system-ui` until the licensed font files are available. Poppins ExtraBold is brand display only; Instrument Serif is rare decorative text only — never labels, data, or controls.

Scale: display 32/38, H1 28/34, H2 24/30, H3 20/26, body large 16/24, body 14/20, caption 12/16, button 14/20 bold, overline 12/16 medium. Nothing essential goes below 12px.

### Layout and motion

| Token | Value |
|---|---|
| Spacing base | 4px increments; standard gaps 8, 12, 16, 24, 32 |
| Page padding | 16px |
| Radius | Fields 12; cards 12–16; pills 999. Do not mix arbitrary values |
| Elevation | Border first. Use a subtle shadow only when a border cannot carry the separation |
| Touch target | 44 × 44px minimum for every tappable control |
| Motion | 160–240ms ease-out; respect reduced motion |

No essential state may be communicated by animation alone.

### Theme

Light and Dark are the same product with different presentation — identical navigation, labels, states, validation, and workflows. Follow the system preference with an in-app override.

---

## Styling Rules

Use NativeWind classes. Do not use StyleSheet unless it is not possible to style with className.

Use the NativeWind version installed in this project. Check package.json. Do not upgrade without approval.

Reuse class patterns through utilities in global.css.

### Classes that do not exist

`global.css` resets Tailwind's default colour, type, weight and radius scales on purpose (`--text-*: initial`, `--font-weight-*: initial`, `--radius-*: initial`). So `text-2xl`, `text-base`, `font-satoshi`, `font-bold` as a weight, `rounded-xl` and `bg-blue-500` are **silently no-ops** — they compile, render nothing, and leave the element at browser defaults. The login screen shipped like that for months. Use the token utilities: `text-h1`/`text-body`/`text-caption`, `font-medium`/`font-bold`, `rounded-field`/`rounded-card`/`rounded-pill`, and the `gg-*` patterns.

### Style Exception List

Use StyleSheet or inline styles for:

- SafeAreaView (className not supported)
- KeyboardAvoidingView (behavior props)
- Modal (visible, transparent props)
- Animated.View (animated style values)
- Dynamic styles calculated at runtime
- Platform specific styles
- Pressable or TouchableOpacity pressed states
- Shadows (different per platform)

Everywhere else, use NativeWind.

---

## Image Rule

Use centralized image imports. Expo's own types declare CSS but **no image formats**, so the import form below only compiles because `types/assets.d.ts` declares them — delete it and `constants/images.ts` stops type-checking.

1. Check if constants/images.ts exists.
2. If not, create it.
3. Import all app images there.
4. Use them through the centralized object.

```ts
import mascot from "@/assets/images/mascot.png";

export const images = {
  mascot,
};
```

```tsx
<Image source={images.mascot} />
```

Do not import image assets directly inside screens or components.

---

## State Management

- Zustand for global client state.
- Local state for temporary UI state.
- AsyncStorage for persistence.

---

## TypeScript

- Strict mode.
- No `any`.
- Keep types simple and readable.

---

## Feature Implementation

When building a feature:

1. Read this file first.
2. Identify the files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Make sure the feature works end to end.
7. Fix lint and type errors before finishing.

---

## Secrets

- Never expose secret keys in client code.
- Use server routes for tokens, AI calls, and any external API access.

---

## Authentication

Use Clerk. Do not build custom auth, and do not use Supabase Auth.

One Clerk application serves every GRIDGO app, so a person holding two roles keeps one account. The platform role (`client`, `supplier`, `rider`, `ops_admin`, `super_admin`) lives in Clerk `publicMetadata`, is writable only through the Backend API, and reaches this app as a session claim — read it, never write it.

This app serves `client`. Check the role once, at the door, and hand a non-client user off to their own app. That check decides what renders, nothing more: every read and write is decided server-side by Row Level Security against the Clerk user id and role claim, so removing the check would grant no access.

Clients are the only role that signs up. Supplier, rider, and admin accounts exist only by invitation from Operations, so this app never offers a path to create one.

---

## Shipping the APK

- **The APK clients sideload is built, proved, and published by CI.** `.github/workflows/android-release.yml` — the same workflow as gridgo-rider's, so keep the two in step: a merge to `main` (or a manual dispatch) runs `expo prebuild` → `assembleRelease` → `scripts/verify-release-apk.sh` → run artifact, GitHub Release, and an upload to the captain's server over the deploy key's forced command (`upload-apk client`, bytes on stdin, digest echoed back and compared). `android/` is generated, never committed — `.gitignore` keeps it out and a checked-in copy drifts from `app.json` on every Expo upgrade — so `npx expo config --type public` has to gate the build. Note `expo prebuild` also rewrites `package.json`'s `android`/`ios` scripts to `expo run:*`; throwaway in CI. Locally, keep `start` as `expo start --dev-client` and `android` as `expo run:android`; revert only `ios` if a prebuild flipped it. Two failures are invisible in a green log and both are asserted against the built APK rather than trusted: Expo's generated `android/app/build.gradle` points the release build type at `signingConfigs.debug`, so signing comes from AGP's injected config (a properties file in `~/.gradle`, never the gradle command line, which would put the password in the process list) and the APK's certificate is then compared to the keystore alias; and **`EXPO_PUBLIC_*` values are build-time configuration**, so `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` must be on the release job's `expo config`, `expo prebuild`, and Gradle steps. Config/prebuild stamps Clerk into `extra.clerkPublishableKey` when the env is present; `lib/clerkAuth.ts` `resolveClerkPublishableKey` also keeps a static `process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` read so Babel can inline the live value at `assembleRelease` if extra was empty. Never print the key. Release rejects anything except `pk_live_*`, and the verifier requires both public values inside `assets/index.android.bundle` without printing either. `__tests__/releaseWorkflow.test.ts` and `__tests__/verifyReleaseApk.test.ts` pin the workflow and built-artifact behavior. Triggers earn different outputs: a pull request gets config, typecheck and tests and references no secret at all; only the default branch names a Release or replaces what the download page serves.

- **A sideloaded build must not call itself 1.0.0 forever.** There is no store listing to tell two APKs apart, and Android refuses to install over an equal `versionCode`. So `app.config.ts` — which now sits over `app.json` and is the config Expo actually evaluates — stamps a build identity: `app.json` keeps MAJOR.MINOR as the release line, CI's run number owns the patch segment and the `versionCode` (`GRIDGO_BUILD_NUMBER`). Locally the `app.json` version stands unchanged, so nothing on a developer's machine pretends to be a release. The rule lives in `app.config.ts` rather than `lib/` because @expo/config's loader will not resolve an extensionless relative `.ts` import and the `.ts` spelling that does resolve is a `tsc` error; `__tests__/appConfigVersion.test.ts` tests it where it runs.

---

## Communication

Be concise. Explain what changed and how to test it.

---

## Final Reminder

Before every feature:

- Read this file.
- Follow it strictly.
- Build clean, simple code.
- Replicate UI exactly when designs are provided.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
