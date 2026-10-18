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

Open screens refresh when GRIDGO reports relevant changes and reconcile after reconnecting or returning to the foreground. Order cards and details include the order ID. Push taps wait for sign-in and navigation readiness, then open an accessible order or the Notifications inbox; a rider's message opens that delivery's chat and an Operations message opens its own support thread (or chat history when that thread cannot be read). Android notifications use the audible `gridgo_default` channel; if the phone has silenced it, the notifications card offers the channel's settings. Foreground updates work independently of push permission; see [Live resource updates](docs/REALTIME_UPDATES.md) for implementation guidance.

The notification bell is on every signed-in screen: the Notifications tab on tab screens, and a header bell on pushed screens that opens the inbox over the current screen. Each new update while the app is open swings the bell and plays a short chime once (one chime per burst of updates; nothing for what arrived while the app was in the background). The chime follows the phone's silent mode and can be turned off in Settings > App sounds (the same switch mutes the receipt's print sound); reduce motion keeps the bell still, and a screen reader hears the update instead.

## App updates

A Google Play build never does any of this; see [Google Play bundle](#google-play-bundle).

A release APK looks for a newer GitHub Release on launch and on return to the foreground (at most every four hours) and offers the landing site's APK. **Later** quiets that version until the next day. The first launch of a newer build confirms the update. Expo Go and development builds skip the check; to see the prompt there, pretend to be an older build:

```bash
EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE=1 npm start -- --clear
```

Restart with a later number (for example the current release's) to see "Update completed". `--clear` matters: the value is inlined at bundle time, and Metro's cache would keep the old one.

Every decision the check makes is logged to Metro in a development build, one `[update-check]` line each: which build it compared (or `off: … EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set` when the override never reached the bundle), what GitHub answered, and whether the release was offered. If the prompt does not appear, those lines say why. A **Later** from an earlier run is remembered on the phone for the rest of that day; clear Expo Go's storage for the project to see the prompt again.

## iPhone build and TestFlight

The iPhone app builds on a GitHub-hosted Mac (`macos-26`, Xcode 26.6; Expo SDK 57 needs
Xcode 26.4+), because the repository is public and those minutes are free and uncapped while
the Expo plan's iOS builds run out. **Actions → iOS TestFlight → Run workflow** runs
`eas build --local` with the `production` profile in `eas.json` (an App Store build; EAS
still holds the signing certificate and profile and raises the build number by one each
time) and then uploads the IPA to App Store Connect with `xcrun altool`. Untick
**submit_to_testflight** to build only. The run summary names the version and build number.
Nothing reaches the App Store listing or review from here.

What the iPhone build has that Android does not:

- **Sign in with Apple** on Sign In, above Google (`components/auth/AppleButton.ios.tsx`,
  `lib/appleSignIn.ts`). It lands through `completeClerkAuth` like every other sign-in, and a
  new person finishes on Finish signing up, as with Google. Android and the web draw nothing.
- **Push through Firebase.** The API sends through FCM, which cannot address the APNs token
  expo-notifications returns on iOS, so the iPhone registers Firebase's FCM token instead
  (`lib/firebaseMessaging.ios.ts`). `@react-native-firebase` is linked on iOS only
  (`react-native.config.js`); Android push is unchanged. A build without
  `GoogleService-Info.plist` leaves Firebase out and registers the APNs token as before.
- **App Store settings** in `app.json` and `plugins/withIosStoreBuild.js`: iPhone only (no
  iPad), a GRIDGO sentence for every permission, no background audio mode, the
  export-compliance answer, and dynamic frameworks for Firebase.

The workflow needs, once:

| Where | Name | What |
|---|---|---|
| GitHub secret | `EXPO_TOKEN` | Already used by the Play upload. |
| GitHub secret | `ASC_API_KEY_P8` | App Store Connect API key (Users and Access → Integrations → Team Keys, role App Manager): the `.p8` file's text. |
| GitHub secret | `ASC_KEY_ID` | That key's Key ID. |
| GitHub secret | `ASC_ISSUER_ID` | The Issuer ID shown above the key list. |
| GitHub variable | `ASC_APP_ID` | The app's Apple ID (App Store Connect → the app → App Information). Not secret. |
| GitHub secret | `GOOGLE_SERVICE_INFO_PLIST_BASE64` | The Firebase `GoogleService-Info.plist` for `ph.gridgo.client`, base64-encoded. Never commit it. |

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CARTO_API_KEY`
come from the repository secrets the Android release already uses; the workflow copies them
to the EAS `production` environment as Sensitive variables before each build, and the local
build reads them back from there. The Firebase file is decoded into a private temp file on
the runner instead, because a local build cannot read an EAS Secret file variable.
`app.config.ts` refuses a store build that is missing any of them or the Firebase file
(`iosStoreBuildProblems`). The App Store Connect key lets EAS check the signing credentials
and lets altool upload.

To try the iPhone build locally, drop `GoogleService-Info.plist` in the repo root (it is
gitignored) or point `GOOGLE_SERVICE_INFO_PLIST` at it, then `npx expo prebuild -p ios` on
a Mac. Sign in with Apple and Firebase need a development build; Expo Go has neither.

## Android emulator API URL

From the **Android emulator**, `127.0.0.1` is the emulator itself. Use:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm start
```

Physical device / Expo Go on phone: use the host LAN IP (e.g. `http://192.168.1.55:8787`).


### Release notifications

After the Android workflow uploads the APK and publishes the latest GitHub Release
on a push to `main`, `scripts/announce-release.mjs` broadcasts the released version.
Firstmate configures the repository secret `RELEASE_ANNOUNCE_TOKEN` with the same
value as the API environment variable. Deploy the API release-announcement route
and migration first. Missing configuration skips with a notice; delivery failures
warn in the job summary without failing the published release. Manual dispatches
never broadcast. `lib/releasePush.ts` recognizes the fixed public release copy and
opens this app's existing download URL on a push tap, including while signed out.
A Google Play build ignores that tap's download and leaves the push in the inbox.

### Google Play bundle

The side-load APK is unchanged: every push to `main` still builds it, puts it on the
download page, publishes the GitHub Release and broadcasts the release push. The Play
bundle is an extra build that you start by hand. You upload it to Play Console yourself,
or let the run upload it to internal testing (see below).

1. In GitHub, open **Actions → Android release APK → Run workflow**. Choose `main`,
   select **play_bundle**, and run it.
2. When the run is green, open its summary and download the `gridgo-client-<version>-<sha>-play`
   artifact. The zip holds `gridgo-client-<version>-<sha>.aab`. The summary also shows the versionCode.
3. In Play Console, open **GRIDGO Client → Testing → Internal testing → Create new release**,
   upload the `.aab`, and roll it out to your testers.

That run builds `./gradlew bundleRelease` with the same upload key and public
configuration as the APK. `scripts/verify-release-apk.sh` checks it the same way: the
signer must match the keystore alias, and the API URL, Clerk and CARTO keys must be
inlined in `base/assets/index.android.bundle`. Unless **submit_to_play** is selected,
the run publishes nothing: no APK, no landing-site upload, no GitHub Release, no release push and no What's new record. The
artifact is kept for 30 days.

The run sets `EXPO_PUBLIC_APP_DISTRIBUTION=play` when it builds. Google Play does not
allow an app installed from Play to offer an APK from somewhere else. With the flag set,
the update sheet, the pinned update card, the "Updated to" item and the release push's
download link are all off (`lib/buildDistribution.ts`, `offersSideloadUpdates` in
`lib/appUpdate.ts`). Play delivers the updates. When the flag is not set, the build is the
side-load APK, and it behaves as before.

**versionCode.** Play accepts only a versionCode higher than every one it has seen for
the app. The versionCode is the workflow's run number (`GRIDGO_BUILD_NUMBER`, see
`app.config.ts`). APK runs and Play runs share one counter, and each new run gets a
higher number, so a new Play run always has a higher versionCode than the last bundle
you uploaded. Upload bundles oldest first. Do not upload a bundle from an older run after
a newer one. A **Re-run** keeps the original run's number, so start a new run instead.
GitHub restarts the count if the workflow file is renamed or replaced, so keep the file
where it is.

**Upload to the internal testing track automatically.** Select **submit_to_play** as well
as **play_bundle** when you run the workflow. The run builds and verifies the bundle as
above and keeps the artifact. Then [EAS Submit](https://docs.expo.dev/submit/android/)
uploads that same `.aab` to Play's **internal testing** track with release status
`completed` (`eas.json`, profile `production`). The run summary says when the bundle was
submitted. **submit_to_play** does nothing without **play_bundle**, and the APK path is
unchanged.

- The build still runs in GitHub Actions with the upload key. EAS only uploads the file.
  No keystore goes to Expo.
- The run never uploads to production and never promotes a release. To move a build to
  another track, promote it by hand in Play Console.
- The step needs two repository secrets: `EXPO_TOKEN` (an Expo access token for the
  `felyciaaa` account) and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (the Play service account's
  JSON key, with release permission for testing tracks). The key is written to a mode-600
  file under `$RUNNER_TEMP`, outside the workspace, for that step only. It is never
  printed, and it is removed when the step ends.
- `eas-cli` is pinned in the workflow. The app is linked to its EAS project through
  `owner` and `extra.eas.projectId` in `app.json`.
- `eas submit` carries no release notes, so the same step then sets them on that release
  with the Google Play Developer API, using the same service account
  (`scripts/play-release-notes.mjs`). The notes are the version's What's new (the pending
  `whats-new/` notes, or the newest release in `WHATS_NEW.md`), newest first, in whole
  lines within Play's 500-character limit for en-US. The script reads the notes back from
  Play, and the run summary shows them.
- The versionCode is the run number, so every upload is newer than the last one and
  testers get it as an automatic update.
- If the submission fails, the run fails, but the artifact is still there to upload by hand.
