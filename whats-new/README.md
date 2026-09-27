# Pending "What's new" notes

A client reads each file here in the update prompt, under "What's new in <version>". Each user-facing pull request adds one file.

- **Name:** `<PR number>-<short-slug>.md`, for example `108-update-prompt-returns.md`. The number orders the list.
- **Content:** exactly one line, a bullet starting `- `, at most 120 characters.
- **Style:** plain words that a client understands, describing what they will notice. Do not include links, code, file names, issue numbers, people, or anything private.

`node scripts/whats-new.js check` validates the notes, and `__tests__/whatsNew.test.ts` runs the same check in CI. When a release ships, CI copies these notes into the GitHub Release and files them in [`WHATS_NEW.md`](../WHATS_NEW.md) under the version. Then it deletes the files here.

A change that a client would not notice, such as a refactor, a test, or CI work, needs no note.
