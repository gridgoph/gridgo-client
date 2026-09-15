# Live resource updates

The app sends its client role context to the API, which verifies membership and record access. Clerk's primary-role metadata does not replace the API membership projection. Notification list, stream and read-all share that context; `lib/api.ts` and `lib/alertStream.ts` own the request details. Minimal invalidation events refresh authorized data, and reconnect/foreground reconciliation covers missed ephemeral events.

Live reloads are coalesced and serialized. Request deadlines bound token acquisition, headers and response body reads so a stalled transport cannot block the next queued refresh. Identity changes revalidate protected data, while account boundaries clear old caches and reject late responses.

`hooks/useLiveNotifications.ts` owns the foreground stream and disconnected fallback. Catalog-related invalidations clear board, listing and product-category caches before broadcasting refreshes, including on reconnect. `hooks/useLiveRefresh.ts` subscribes while a screen is focused; callers that already load on focus disable its initial trigger. Tracking retains its focused polling fallback.

`store/notifications.ts` persists the inbox, snapshot and optimistic read overlay under an account-specific key. Switching accounts immediately clears the visible inbox, and cache hydration cannot overwrite a newer server response. Refresh keeps an existing list visible; a failed empty-list read ends loading with an error. Server read flags remain authoritative after reconciliation. Notification rows carry their own order title and state, so their stage rail does not depend on an orders-list request.

Refresh backing data without reinitializing in-progress form drafts. Native push taps wait for verified identity and navigator readiness, then load records through the ordinary authorized API; unavailable destinations land in the inbox. Push permission is independent of foreground SSE.

`hooks/usePushNotifications.ts` defers a cold-start target until a protected destination has mounted, checks order access and discards work belonging to an earlier account or tap. `hooks/__tests__/pushNavigationReady.test.tsx` covers navigation readiness; native delivery still requires device verification. User-facing behavior is documented in [README.md](../README.md#updates-and-notifications).
