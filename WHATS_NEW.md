# What's new in GRIDGO Client

Each GRIDGO Client release carries a short list of plain-language notes. The app shows them in the update prompt and on the Notifications card, under "What's new in <version>", and keeps every release below in Settings > What's new.

Each release heading carries a label for the kind of release, in brackets:

- **New feature**: the release adds something a client can now do.
- **Improvement**: something a client already did works or reads better.
- **Fix**: something that was broken now works.

A release takes the biggest kind among its notes (see [`whats-new/README.md`](whats-new/README.md)). The version numbers stay as CI writes them; the label is not part of the version. There is no beta channel, so there is no Beta label.

Nothing here is technical or private. A client reads it on their phone.

## Unreleased

Changes that have merged but are not released yet. Each one is a file in [`whats-new/`](whats-new/README.md). When a release ships, `.github/workflows/android-release.yml` does two things:

- It copies these notes into the release body, under `## What's new`.
- It moves them below, under that version's heading.

<!-- CI adds each release below this line. -->

## 1.0.197 (New feature)

- Listings now show how far away they are as a zone, plus shop ratings, and warn before an out-of-zone pick.
- Matching now shows a Top Pick and why it was chosen, other listings for your date, and a quick priority check per job.

## 1.0.191 (Fix)

- Closing and reopening the app no longer empties your basket.

## 1.0.188 (New feature)

- Type in the Home search bar to see matching prints drop down under it, then tap one to start your order.

## 1.0.185 (New feature)

- Settings now has a What's new page: every version's notes, newest first, marked New feature, Improvement or Fix.

## 1.0.178 (Fix)

- Adding something from a different print shop now explains why and lets you check out first or start a new order.

## 1.0.174 (Improvement)

- Orders open on their latest progress. Tap it for the full history with photos; details fold away until needed.

## 1.0.171 (Fix)

- Typing in the Operations chat keeps the newest messages and your message in view above the keyboard.

## 1.0.166 (Fix)

- Changing what GRIDGO matches on now saves reliably, says Saved or Not saved, and lets you try again.

## 1.0.163 (New feature)

- Your order now shows the print shop's progress photos, or says it is waiting for one, and its history reads plainly.

## 1.0.158 (New feature)

- Ask for a refund on an order and follow it until the money is sent to your own GCash, Maya or bank QR.

## 1.0.154 (New feature)

- New to GRIDGO? A short guided tour now walks your first order from Home to checkout. Replay it from Account.

## 1.0.147 (Improvement)

- After you place an order, your order summary now prints out on screen, with a thank-you and a link to your order.

## 1.0.143 (New feature)

- Paste a Canva or other design link on the artwork step, and GRIDGO checks that anyone with it can open it.

## 1.0.138 (Fix)

- Sample photos no longer go blank after the app sits in the background; they reload by themselves.

## 1.0.134 (Improvement)

- If your account is suspended or removed, the app now tells you why and lets you sign out.

## 1.0.128 (New feature)

- The update prompt now comes back each time you open the app, until you install the new version.
- App updates now show at the top of Notifications, with an Update now button.
- The update prompt now lists what's new in each version.
