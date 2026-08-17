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

- Auth (**Clerk identity + gridgo-api projection**). Clerk owns the identity session; `gridgo-api` remains authoritative for the signed-in user's client projection. A user whose role is not `client` is told which app to use rather than being shown a different role's navigation. There is no role switcher.
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

- **Auth** — `@clerk/expo` uses SecureStore for the identity session; `hooks/useClerkApiSession.ts` supplies a fresh Clerk Bearer (`getToken({ skipCache: true })`) to `lib/api.ts`, then `lib/clerkSessionBridge.ts` joins it to a `client` projection in Zustand (`store/session.ts`). A Clerk JWT 401 on `GET /auth/me` is unmapped, not a dead session — probe with `ignoreUnauthorized`, then `POST /auth/clerk/activate`, then `/auth/me` after a refreshed token (activate writes `gridgo_role`). Do not null the token provider in an effect cleanup: Clerk recreates `getToken` often, and that gap is how me/activate go out with no Bearer. Google SSO lives in `lib/googleSso.ts`: after `startSSOFlow`, call `setActive({ session })`. Password and Google both go through `lib/clerkSignIn.ts`: a leftover session that can mint a JWT is adopted, then `lib/clerkGridgoSync.ts` must set `user` (or `pendingClerkProfile`) in the same tap — `requestClerkSync` alone leaves login up when `useAuth().isSignedIn` is still false. Password that returns `needs_second_factor` or `needs_client_trust` sends Clerk's email (or listed) second-factor code and reuses the recovery-code step (`store/loginFlow.ts`) — never throw "another verification step" for those statuses. One that cannot mint a JWT is signed out and the attempt retries. Never show "already signed in" / "currently logged in" as a login failure; if GRIDGO cannot adopt, offer sign-out of Clerk. The `__DEV__` sign-in fallback may still use a legacy `tok_*` token.

  **Every finished Clerk flow leaves through `lib/clerkComplete.ts`.** `completeClerkAuth` finalizes (or activates the session Clerk says already exists) and then adopts the GRIDGO client; `withSettledClerkSession` settles a leftover first and retries once when Clerk answers "currently logged in". Sign-up and sign-in both call it, from every branch that reaches `complete` — password, emailed code, password reset, Google. Clerk finalizing alone is **not** landing: Home renders on `useSession().user`, so a flow that finalizes without adopting leaves the person on the form watching nothing happen, which is exactly what both reported "does not go home" bugs were. `lib/clerkSignIn.ts` / `lib/clerkSignUp.ts` hold the pure continuations (which status collects a code, which is blocked, and the copy for it) — decide there, never inside a screen.
  Clerk **throws** `You are signed out` from `getToken` / `signOut` once the session is gone. Reach for `clerkSessionToken` and `releaseClerkSession` (both answer instead of throwing) — a raw call in an effect is an unhandled rejection, which is the Metro "Unable to authenticate" flood, and one inside `logout`'s `finally` would abandon the state clear.
- **Where a session lands is `lib/authLanding.ts`, rendered by `components/AuthLandingRedirect.tsx`.** Complete profile → first-run onboarding (only for a client `activate` had to create, and it clears the flag) → Home. Five screens each carried their own copy of that ladder and drifted; index, welcome, login, signup and complete-profile now share this one. `app/index.tsx` matters twice over: `Stack.Protected` removes the auth screens in the same commit that a session appears, so the `<Redirect>` an auth screen renders may never run and index is where the guard lands.
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
- `lib/payment.ts` — the 75/25 split: which half is payable, which is with Operations, reference validation, and the copy that says GRIDGO takes QR only. **Cash on delivery and Pilot Credits are not payment methods** — both routes are `410`/`400` server-side, and offering either walks a client into an error. Balance is asked for from `ready_for_dispatch` onward, not the moment the downpayment clears, or the split is a fiction
- `lib/fulfilment.ts` — the supplier's milestones as the client may read them: `printing`, `packaging_qc`, `delivered`. `retention` is a hold-back on someone else's payout and is deliberately not shown, and the server withholds milestone amounts
- `lib/signup.ts` — client self sign-up and the Google profile-complete lockup (`needsClientProfile`); account type reaches `GridgoLogo` through the session and must not be re-derived
- `lib/googleSso.ts` / `lib/clerkSessionBridge.ts` — Google `setActive` completion, and the activate-then-`/auth/me` bridge (wrong role signs out of Clerk)
- `lib/clerkComplete.ts` / `lib/authLanding.ts` — the one way out of a finished Clerk flow, and the one ladder that decides where it lands (see **Auth** above)
- `lib/orderStages.ts` — the four coarse stages (Order, Printing, Dispatch, Delivered) the legacy app drew on every notification. Unknown state → `null` → no rail, never a guessed position
- `lib/requestValidation.ts` — stepper validation; artwork passes only on a server-issued `fileId`
- `lib/taxonomy.ts` + `lib/zones.ts` — materials and finishes come from `GET /taxonomy`; a zone is a named part of Davao and **carries no fee**. Delivery is priced by distance bands in `GET /settings`, from the assigned supplier's shop, so it does not exist until a supplier does. Never hardcode a material or a delivery fee. An order can store a taxonomy *code* rather than a name (`hem_grommet` reached a client's screen that way) — render it through `taxonomyLabel`.
- `lib/productCategories.ts` — the **customer-facing** product tree (four categories, seventeen subcategories, each with the audience and example text a client recognises themselves in). A different thing from `lib/taxonomy.ts`, which holds the *production* categories that gate materials and finishes. Read it through `api.getProductCategories()`; `adaptProductCategories` is a deliberately forgiving reader over `GET /taxonomy` because the API contract had not landed, and falls back to `data/productCategories.ts`. **Narrow the field-name aliases and delete the seed once the API publishes the tree.** A subcategory maps to catalog *families*, so it becomes orderable the moment Operations prices one — a subcategory with no family is shown as quoted by Operations, never as a button that leads nowhere.
- `lib/sizes.ts` — the one pick list the client owns (the platform has no size taxonomy). Custom is allowed only where the trade cuts to order, and is marked as custom.
- `lib/deadline.ts` / `lib/quantity.ts` / `lib/address.ts` — bounds and wording for the date-time picker, the quantity stepper and the structured address
- `lib/artworkUpload.ts` — upload phases and error copy. **Transfer progress is not success**: only a `201` carrying a `fileId` reaches `stored`.
- `lib/tracking.ts` — staleness, remaining distance, and the lat/lng ↔ GeoJSON `[lon, lat]` boundary. GRIDGO publishes no ETA; do not invent one.
- `lib/mapHtml.ts` + `lib/osrm.ts` + `components/DeliveryMap.native.tsx` — the map stack, mirroring the same-named files in **gridgo-rider**. See "Maps" below.
- `lib/issueWindow.ts` — the window's length is `issueWindowHours` from `GET /settings`, never a constant, and under v2 it genuinely expires: the platform stamps `issueWindowExpiresAt` and closes it, so remaining time is honest to show
- `lib/productPreview.ts` — template map; mockup label is fixed here
- `lib/persistStorage.ts` — required Zustand persistence boundary: use AsyncStorage in native/real-browser runtimes and inert storage only when `typeof window === "undefined"` during SSR; never gate persistence on `Platform.OS`
- `lib/navigationHeaders.ts` — **every pushed root-stack screen goes through `pushedScreenOptions("<title>")`**, which does two jobs. It sets `headerBackButtonDisplayMode: "minimal"` — the bare chevron the captain asked for, and the thing that stops iOS writing the previous screen's title (`(tabs)`, or one origin's name) on the control. A screen whose header is hidden still needs a `title`, because that is what a pushed child's back control falls back to. And it *requires* a title: the band is drawn at full height whether or not anything is in it, so `title: ""` spent a header's height on a chevron and nothing else (the reported "empty space above the heading"). Pick a title that does not repeat the screen's own heading; both request screens say "New request" because they are two screens of one flow. `lib/__tests__/pushedRouteLayout.test.ts` reads `app/_layout.tsx` and fails if a new route skips either half.
- **A screen under a visible header never sets `edges={["top"]}`.** The header has already cleared the status bar and the prop is *additive*, so a second inset is a notch's worth of blank canvas — invisible on Expo web, where insets are zero, and ~47pt on the phone. Pushed screens use `edges={["bottom"]}`; only the tab screens and full-bleed routes own their top edge. Same test pins it.
- **Never `router.replace` onto a root-stack sibling from inside `(tabs)`.** The root stack's only entry is the tab shell, so `REPLACE` swaps it out: no tab bar, no back control, only OS gestures. Switch tab then `push` (see `sendRequest` in `app/(tabs)/new-request.tsx`). Any screen reachable by deep link also needs its own escape when `!router.canGoBack()` — `app/order/[id].tsx` sets a `headerLeft` for it.
- `components/Skeleton.tsx` — placeholder shapes with a highlight **sweep** (~1.1s), the loading language the legacy app used. Ambient loading, not a transition: the 160–240ms budget governs transitions, and an opacity pulse inside it would strobe. Reduce motion drops the sweep and keeps the shapes. Shape the composition like the screen it becomes (`SkeletonOrderCard`) — a wrong-height placeholder is the "it jumps" bug. `components/LoadingOverlay.tsx` is the other case: work that blocks a screen already on display.
- Tab screens pad their scroll content with `tabScreenContentPadding(insets.bottom)`. The bar floats over the scene, so a flat `pb-*` puts the last control underneath it.
- `lib/sessionGuard.ts` + root `app/_layout.tsx` — Expo Router `Stack.Protected` guards the signed-in root stack (`(tabs)`, `order/[id]`, `design-system`, `settings`). Session clear (logout / 401 / rejected role) alone returns to login; do not scatter `router.replace` at call sites. `app/index.tsx` is launch-only mapping.
- `lib/onboardingExit.ts` — explicit onboarding dismiss targets (`returnTo=settings` vs first-launch). Do not rely on history alone for Settings replay.
- Onboarding pager is full-height over the content area (art behind, `pointerEvents="none"`) so swipes work over the illustration; parallax stays outside the pager.
- Account holds identity + Sign out; theme and “View onboarding” live on `app/settings.tsx`.
- `components/GridgoTabBar.tsx` — geometry is per platform and both halves were captain reports. iOS gets the HIG's **49pt** content row (83pt with the home indicator, exactly UIKit); Android gets Material 3's **80dp** container (`NavigationBarTokens.TallContainerHeight`; the 64dp `ContainerHeight` is the short/expressive bar, not this one). Where the platform reserves a bottom inset, **that inset is the whole breathing room** — adding a design pad on top of 34pt is what "the tab bar sits too high" was. The design gap is a **floor under** the inset, never a zero-check: a `> 0` test gave a device reporting 2dp *less* room than one reserving nothing. Two facts people keep re-deriving wrongly, both checked against source rather than memory: MD3 puts the system inset **beneath** the 80dp container (androidx `NavigationBar` applies `windowInsetsPadding` *outside* `defaultMinSize`, and `InsetsPaddingModifier` reports `child + inset`), so 80 + 48 = 128dp on three-button is Material's own answer and not a double-count; and under Expo's edge-to-edge Android the bottom inset is **always real** (~48dp three-button, ~24dp gesture) — "no inset" means Expo web or a pre-indicator iPhone, never an Android phone. `tabBarPaintedHeight(platformOS, insetBottom)` is the whole table as one pure function; assert against it. Columns keep a `minHeight`, never a rigid height, or the badge has no slack. Keep the three apps identical.

  **Measure the top gap from the paint, not from the layout box.** This app and gridgo-rider draw a raised action disc, so the surface is painted `actionRise` below the top of the bar's layout box and only the action column reaches up into that strip; gridgo-supplier has no disc and paints edge to edge. Item padding measured from the layout top therefore bought `actionRise` less room here than there — the captain's "items sit too close to the top edge", and on iOS the 49pt stack fills its column exactly, so the glyph sat 6pt *above* the paint. `tabBarTopGap(platformOS)` is that space, and it is now gridgo-supplier's: **4pt on iOS, 20dp on Android**. Do not close the gap by shrinking `actionRise` — that number *is* the overhang. `tabBarHeight` is the layout box (painted bar + strip); `tabScreenContentPadding` clears it.
- `components/GridgoLogo.tsx` — mark + wordmark + optional role lockup (`GridgoLogoRole`). Client uses `logoRoleForClientAccount(user.accountType)` only — never infer from `orgName`. Signed-out surfaces stay plain GRIDGO (no flash). Identity surfaces only: login, onboarding, home header. **Layout rule:** the mark sits left and stands as tall as the whole text block; the wordmark and role stack in a column beside it. Never a mark/wordmark row with the role hung underneath — that caps the mark at one line and has been rejected twice. All geometry is derived in `gridgoLockupMetrics`, and `size` means the plain lockup's mark edge, not the rendered height.
- `app/request/category.tsx` + `app/request/[category].tsx` — choosing what to print. This sits **ahead of** the four-step stepper, not inside it: the stepper specifies a job already decided on, and a reorder skips the choice entirely. The tab bar's yellow "+" is the app's one start-a-request control and routes here when nothing is chosen (`app/(tabs)/_layout.tsx`) — do not add a second start button to a screen.
- `store/requestDraft.ts` — in-progress request (Zustand + AsyncStorage)
- `store/theme.ts` — system/light/dark preference persistence
- `store/notifications.ts` — the API has **no mark-as-read route**, so dismissals are a persisted per-device `readIds` set. Without it a swipe would un-read itself on the next refresh. Delete it the day `POST /notifications/:id/read` lands.

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
- **Expo Go cannot do any of this.** Expo removed Android remote push from Expo Go in SDK 53 and the module *throws at import time*, not at `getDevicePushTokenAsync`. Never statically import `expo-notifications` from a module that loads at launch or on public auth (`store/push.ts`, `hooks/usePushNotifications.ts`, login). `getNotificationsNative` skips Expo Go and treats a failed require as "push is off". A throw costs push, never the app. Push is only observable in an installed build — `npx expo prebuild --platform android` + `./gradlew assembleRelease`, then `adb install`. Note prebuild rewrites `package.json`'s `android`/`ios` scripts to `expo run:*`; revert that if you prebuild locally.
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

- `lib/mapHtml.ts` builds the whole Leaflet document. Model changes are pushed into the live page with `injectJavaScript`; only a theme flip rebuilds the HTML, so the tile set swaps cleanly.
- Leaflet is loaded from unpkg with `integrity="sha384-…"`. Bump the version and you must recompute both hashes, or the map silently stops loading. The command is in the comment above the tags.
- OSM tile attribution is a licence condition. Never hide it.
- `lib/osrm.ts` uses the free, keyless, rate-limited public OSRM demo. **Treat failure as normal** — it falls back to a straight line and says so. Nothing on a tracking surface may block on it.
- OSRM path order is `lon,lat`. Reversed, Davao lands in the ocean. `lib/tracking.ts` owns the conversion; convert only at the network/HTML boundary.
- OSRM also returns a travel time. The client deliberately does **not** show it: GRIDGO publishes no ETA, and a routing engine's guess next to a delivery reads as a promise nobody made.
- `components/DeliveryMap.tsx` is the web fallback. `react-native-webview` has no web build and renders its own red "does not support this platform" string — an internal message that must never reach a client.

### Sheets and modals

Two mechanisms, chosen by what the content is:

- **A route** presented as the platform's own form sheet — `presentation: "formSheet"` with `sheetAllowedDetents: "fitToContents"` in `app/_layout.tsx`, as `app/order/request-changes.tsx` does. Use this whenever the content is a real destination, especially one with an input: drag-dismiss, the back gesture and focus containment all come from the platform. Guard unsaved work with `usePreventRemove`, which catches every in-app dismissal path. Keyboard avoidance is **half** platform, so read the comment on that screen before touching it: react-native-screens lifts a form sheet off the IME on Android (`SheetDelegate.onApplyWindowInsets`) and nothing lifts it on iOS, where `behavior="padding"` against a `fitToContents` detent is what raises it. Adding padding on both would lift it twice.
- **`components/Sheet.tsx`** for a reusable form control whose options are computed by its caller (`OptionPicker`, `DateTimeField`) — routing those would push option lists through URL params. Physics live in `lib/sheet.ts` and are unit-tested; the drag uses `PanResponder`, **not** react-native-gesture-handler, because RNGH resolves its root through the view tree and a React Native `Modal` renders outside it, so a `GestureDetector` in there silently never fires.

Never hand-roll a `<Modal animationType="slide">` again — a fixed ramp that ignores the finger is what "the modal slide is not optimized" described. A centred `ConfirmDialog` is still correct for a one-question alert; its scrim dismisses a routine confirmation but never a destructive one.

**Expo web cannot exercise any of this.** React Native Web's responder system does not reach inside a `Modal` portal, so no drag library receives events there. Sheet gestures are a device check, not a web check — and so is everything under "Keyboard", below: a browser has no soft keyboard.

### Keyboard

**Every screen that takes typed input opens through `components/FormScreen.tsx`.** It is a `SafeAreaView` around `KeyboardAwareScrollView` from `react-native-keyboard-controller`, with `KeyboardProvider` at the root layout. `components/__tests__/keyboardCoverage.test.ts` reads the sources and fails if a route renders a field — its own, or one of the components that carries one — outside the shell.

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

## Running and testing

- `npx tsc --noEmit`, `npx jest`, `npx expo lint` all have to be clean.
- **Expo web boots only because `metro.config.js` resolves zustand through its CommonJS build.** zustand serves native the CJS build via the `react-native` export condition and everyone else an ESM build whose devtools middleware reads `import.meta.env`; Metro emits web as a classic script, so that is a syntax error that kills the *whole* bundle with one console line and a blank page. Session, theme and the request draft all import `zustand/middleware`, so this is not an edge case.
- Metro's file watcher does not reliably pick up edits in a git worktree here. If a screen looks stale in the browser, restart the dev server rather than doubting the change.
- `@testing-library/react-native` 14 on React 19 returns a promise from `render`. **`await` it**, or `screen` stays empty and every query fails with "render function has not been called".
- Same combination, two more traps worth knowing before you spend an hour on them. A `fireEvent.changeText` does not land before the next synchronous `fireEvent.press`, so a form submitted in a test reads an empty form — `await waitFor` on the last field's value first. And once a press has driven an **async** update into a store outside React, every later `render` in that file yields an empty tree, even of a bare `<Text>`; put the submitting test last in its file and give a second one its own file (`app/__tests__/signup.test.tsx` and `signup-error.test.tsx`). The same combination also **drops a plain `useState` update made from an async continuation** — the setter runs, the tree never re-renders, and `act`/`rerender` do not recover it, while a Zustand write in the same position does re-render. That is why a multi-step auth screen keeps its step in a store (`store/loginFlow.ts`, `store/signupFlow.ts`) rather than local state; it is the only way the code step is reachable in a test at all.

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

Use centralized image imports.

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

- **The APK clients sideload is built, proved, and published by CI.** `.github/workflows/android-release.yml` — the same workflow as gridgo-rider's, so keep the two in step: a merge to `main` (or a manual dispatch) runs `expo prebuild` → `assembleRelease` → `scripts/verify-release-apk.sh` → run artifact, GitHub Release, and an upload to the captain's server over the deploy key's forced command (`upload-apk client`, bytes on stdin, digest echoed back and compared). `android/` is generated, never committed — `.gitignore` keeps it out and a checked-in copy drifts from `app.json` on every Expo upgrade — so `npx expo config --type public` has to gate the build. Note `expo prebuild` also rewrites `package.json`'s `android`/`ios` scripts to `expo run:*`; throwaway in CI, revert it if you prebuild locally. Two failures are invisible in a green log and both are asserted against the built APK rather than trusted: Expo's generated `android/app/build.gradle` points the release build type at `signingConfigs.debug`, so signing comes from AGP's injected config (a properties file in `~/.gradle`, never the gradle command line, which would put the password in the process list) and the APK's certificate is then compared to the keystore alias; and **`EXPO_PUBLIC_*` values are build-time configuration**, so `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` must be on the release job's `expo config`, `expo prebuild`, and Gradle steps. Config/prebuild stamps Clerk into `extra.clerkPublishableKey` when the env is present; `lib/clerkAuth.ts` `resolveClerkPublishableKey` also keeps a static `process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` read so Babel can inline the live value at `assembleRelease` if extra was empty. Never print the key. Release rejects anything except `pk_live_*`, and the verifier requires both public values inside `assets/index.android.bundle` without printing either. `__tests__/releaseWorkflow.test.ts` and `__tests__/verifyReleaseApk.test.ts` pin the workflow and built-artifact behavior. Triggers earn different outputs: a pull request gets config, typecheck and tests and references no secret at all; only the default branch names a Release or replaces what the download page serves.

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
