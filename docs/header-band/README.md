# Header band — before / after

Evidence for the fix to the reported "empty space above the *What are you printing?*
heading". Both pushed request screens now carry a real header title instead of
`title: ""`.

Captured on Expo web at a 390 × 844 mobile viewport (DPR 2), signed in as the
demo client, walking the app by tapping so the navigation stack — and therefore
the back control — is real. Light and dark come from an emulated
`prefers-color-scheme`, with the theme preference left on **System**.

**What web does not show:** react-native-safe-area-context reports zero insets in
a browser, so none of these images include the status-bar inset a phone adds
above the band. On an iPhone that is a further ~47pt, and it is why
`edges={["top"]}` on a screen that already sits under a header — which
`app/design-system.tsx` was doing — costs a notch's worth of blank canvas that
cannot be photographed here.
