# What's new in GRIDGO Client

Each GRIDGO Client release carries a short list of plain-language notes. The app shows them in the update prompt and on the Notifications card, under "What's new in <version>".

Nothing here is technical or private. A client reads it on their phone.

## Unreleased

Changes that have merged but are not released yet. Each one is a file in [`whats-new/`](whats-new/README.md). When a release ships, `.github/workflows/android-release.yml` does two things:

- It copies these notes into the release body, under `## What's new`.
- It moves them below, under that version's heading.

<!-- CI adds each release below this line. -->

## 1.0.147

- After you place an order, your order summary now prints out on screen, with a thank-you and a link to your order.

## 1.0.143

- Paste a Canva or other design link on the artwork step, and GRIDGO checks that anyone with it can open it.

## 1.0.138

- Sample photos no longer go blank after the app sits in the background; they reload by themselves.

## 1.0.134

- If your account is suspended or removed, the app now tells you why and lets you sign out.

## 1.0.128

- The update prompt now comes back each time you open the app, until you install the new version.
- App updates now show at the top of Notifications, with an Update now button.
- The update prompt now lists what's new in each version.
