# Pending "What's new" notes

A client reads each file here in the update prompt, under "What's new in <version>". Each user-facing pull request adds one file.

- **Name:** `<PR number>-<short-slug>.md`, for example `108-update-prompt-returns.md`. The number orders the list.
- **Content:** an optional `Kind:` line, then exactly one line, a bullet starting `- `, at most 120 characters.
- **Kind:** `Kind: feature` (a client can do something new), `Kind: improvement` (something they already do works or reads better) or `Kind: fix` (something broken now works). Leave it out and the note counts as an improvement. A release is labelled by the biggest kind it carries: New feature, Improvement or Fix. Settings > What's new shows that label; see [`WHATS_NEW.md`](../WHATS_NEW.md).
- **Style:** plain words that a client understands, describing what they will notice. Do not include links, code, file names, issue numbers, people, or anything private.

For example:

```
Kind: fix
- Sample photos no longer go blank after the app sits in the background.
```

`node scripts/whats-new.js check` validates the notes, and `__tests__/whatsNew.test.ts` runs the same check in CI. A CI build bundles [`WHATS_NEW.md`](../WHATS_NEW.md) and these notes (as its own version) into the app, so Settings > What's new reads offline. When a release ships, CI copies these notes and the release label into the GitHub Release and files them in [`WHATS_NEW.md`](../WHATS_NEW.md) under `## <version> (<label>)`. Then it deletes the files here.

A change that a client would not notice, such as a refactor, a test, or CI work, needs no note.
