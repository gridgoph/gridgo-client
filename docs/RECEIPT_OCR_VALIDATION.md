# Receipt OCR in Expo Go

The native path is `usePaymentProof` → `recognizeReceiptFromUri` →
the single root-layout `ReceiptOcrHost` / `RECEIPT_OCR_HTML` → `referenceFromOcr` →
`useCheckoutPayment.applyOcrReference`. Parser fixtures alone do not exercise
the WebView. User-facing checkout guidance lives in [README.md](../README.md#checkout-and-money).

## Draft ownership

`store/checkoutPayment.ts` creates separate in-memory checkout and order-payment
drafts. Checkout binds to its cart id; an order payment binds to order id and
installment. Each draft holds: the local image URI, upload result, OCR state and reference. Navigating
away preserves it; changing its owner, changing accounts or completing its submission clears it.
Opening an order payment does not replace a checkout receipt. It does not persist across process restarts. Replacing a receipt clears
the previous OCR autofill while preserving a manually edited reference; explicitly
removing the receipt also clears the reference.

Upload and OCR completions must still belong to the same account, draft owner and receipt
generation. The recognizer checks ownership after image conversion and before
replacing its queue. During labeled lookahead, neighboring account fields end
the search instead of supplying a number; candidate and confidence filters live
in `lib/receiptOcr.ts`.

## Android verification — 2026-09-08

This is historical SDK 54 evidence, not verification of the current SDK upgrade.

Tested on a Moto G Power (2025), Expo Go 54.0.8, with this project's React
Compiler enabled. A temporary Expo entry rendered the real host and payment
proof hook, using the two original PNGs as data URLs. Only the document picker
and upload response were stubbed; Tesseract, its CDN downloads, the WebView
message bridge, recognition queue, parser, hook state and reference field ran
on the phone. No real payment or order was submitted.

| Original PNG | Hook upload state | OCR state | Payment reference |
| --- | --- | --- | --- |
| `gcash-bankard-receipt.png` | `stored` | `filled` | `965373469` |
| `gcash-send-receipt.png` | `stored` | `filled` | `9044838604781` |

Both also completed through the recognizer directly in approximately 2–4
seconds after model download. The hook check passed again with a fresh model
cache namespace. The original receipt bytes and full OCR text are not committed.

## What failed

- The old host announced ready but did not inject the queued image. An unrelated
  state counter could not make a module-level mutable read reactive under React
  Compiler. `useSyncExternalStore` now subscribes to the actual request snapshot.
- The old 10.4 MB language download stalled on the phone. The pinned integer
  English model is 2.8 MB, uses the same CDN as the worker, and has its own cache.
- These narrow PNGs need enlargement for their small reference type. Real OCR
  puts a copy icon after the biller reference and the date beside the send
  reference. The labeled-number reader preserves the complete numeric token
  without attaching either neighbour; PAN/mobile/date exclusions remain.
- Each request owns a WebView. Replacement or timeout destroys the old worker;
  request IDs prevent late messages from completing a newer receipt.

## Regression checks

Run named Jest files with `--runInBand --forceExit`:

- `lib/__tests__/receiptOcr.test.ts`, `receiptOcrRecognize.test.ts`
- `components/__tests__/ReceiptOcrHost.test.tsx`
- `hooks/__tests__/usePaymentProof.test.ts`, `usePaymentProof-unreadable.test.ts`
- Checkout, checkout OCR, checkout placement/removal, listing and listing-add
  tests under `app/__tests__`
- `lib/__tests__/checkout.test.ts`
- `components/__tests__/keyboardCoverage.test.ts`

Checkout's pending-OCR test checks that the footer is outside the scroll,
Place order is disabled while reading, and missing-reference copy is absent.
The invoice and pinned bar must show the same total. Also run `npx tsc --noEmit`.

## Subsequent order payments

The order's payment panel uses the same picker, streamed `payment_proof` upload,
OCR parser and QR sheet as checkout. The client checks or corrects the reference,
then explicitly confirms the receipt and server-provided amount before sending.
The submission includes `proofFileId` and remains pending until Operations
confirms it. Failed sends retain the receipt/reference; rejection reasons are
shown above the form. No OCR result confirms a payment.

A single `ReceiptOcrHost` lives in `app/_layout.tsx` so stacked checkout and order
routes cannot create two WebView workers for the same recognition request.
