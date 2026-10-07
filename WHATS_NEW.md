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

## 1.0.267 (New feature)

- See a photo of your packed order in its updates before it leaves the print shop.
- Follow your delivery progress while your rider is on the way. Their location appears as they get closer.
- Message your rider during a delivery. Your phone number stays private, and messages go a day after delivery.
- Listing photos show small thumbnails again: tap one to jump, and use them or next and previous in full screen.
- Delete account now lives under Danger zone in Your details and asks for your password or an emailed code first.
- Your details now says your mobile number stays private: riders and shops do not see it.

## 1.0.252 (New feature)

- Delivery and pick-up choices now reflect current availability. Existing pick-up orders stay ready to collect.
- Confirm or change your drop-off pin when your rider is on the way.
- Request account deletion from Account and read the Privacy Policy from Account or sign-up.

## 1.0.245 (New feature)

- The artwork step no longer asks you to add something else first. Add more products at checkout.
- Swipe through a listing's sample photos, with dots to show where you are, and open any of them full screen.

## 1.0.237 (New feature)

- Get a notification when a new app version is ready. Tap it to download the update.
- Listings and matches now say production time in working days, matching the ready date.

## 1.0.229 (New feature)

- Order history stays open even when an update has missing details.
- A sent-back account application reopens with everything you sent, so you only replace what Operations asked for.
- Each item in one order can now have its own date. Checkout groups items by shop and date, each with its delivery fee.

## 1.0.221 (New feature)

- The app no longer keeps checking your sign-in in the background, saving battery and data.
- If your shop cannot take an order or asks for more time, choose a new shop, a new date or a full refund.
- Choose delivery or pick-up before GRIDGO finds your printer, and fix a private design link before you pay.
- One order can now hold products from several shops, grouped as Shop A and Shop B, with one payment and one receipt.
- Organizations can apply with their documents, then get a discount, spend statements and an Organizations tab.
- Pick-up orders show a QR and code to claim at the hub, and deliveries show a code to match with your rider.
- The reference number is read from your payment screenshot and filled in correctly again.
- Cancelled jobs now read as cancelled on Home and Orders, without a ready date, and no longer hide live jobs.

## 1.0.209 (New feature)

- Busy and peak seasons are shaded on the date picker, and Home gives you a heads-up weeks before one starts.
- Delete your own artwork from a completed job. GRIDGO also deletes artwork 30 days after a job is completed.

## 1.0.201 (Improvement)

- New accounts now see what GRIDGO does before being asked for anything, and set their matching priorities at the end.

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
