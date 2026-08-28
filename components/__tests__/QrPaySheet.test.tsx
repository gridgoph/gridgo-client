import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  GCASH_QR_ASPECT_RATIO,
  containFittedSize,
  paymentQrFromSettings,
  paymentQrImageSource,
  paymentQrPlateSize,
  QR_PAY_SHEET_MAX_HEIGHT_RATIO,
  QrPaySheet,
} from "@/components/QrPaySheet";
import { images } from "@/constants/images";
import { notificationImageUrl } from "@/lib/api";

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle));
  }
  return typeof style === "object" ? (style as Record<string, unknown>) : {};
}

describe("paymentQrFromSettings", () => {
  it("reads imageUrl when Operations has uploaded a plate", () => {
    expect(
      paymentQrFromSettings({
        paymentQr: { method: "qr_manual", caption: "QR Ph", imageUrl: "/public/payment-qr?v=file_1" },
      }),
    ).toEqual({
      method: "qr_manual",
      caption: "QR Ph",
      imageUrl: "/public/payment-qr?v=file_1",
    });
  });

  it("omits imageUrl when settings have none", () => {
    expect(paymentQrFromSettings({ paymentQr: { method: "qr_manual", caption: "QR Ph" } })).toEqual({
      method: "qr_manual",
      caption: "QR Ph",
    });
    expect(paymentQrFromSettings({ issueWindowHours: 24 })).toBeNull();
  });
});

describe("paymentQrImageSource", () => {
  it("prefers the uploaded public URL", () => {
    expect(paymentQrImageSource("/public/payment-qr?v=file_1")).toEqual({
      uri: notificationImageUrl("/public/payment-qr?v=file_1"),
    });
  });

  it("falls back to the bundled GCash plate when settings omitted the URL", () => {
    expect(paymentQrImageSource(null)).toBe(images.gcashQr);
    expect(paymentQrImageSource(undefined)).toBe(images.gcashQr);
    expect(paymentQrImageSource("")).toBe(images.gcashQr);
  });
});

describe("containFittedSize", () => {
  it("shrinks a portrait plate to fit a shorter box instead of cover-cropping", () => {
    const box = containFittedSize({
      maxWidth: 256,
      maxHeight: 300,
      aspectRatio: GCASH_QR_ASPECT_RATIO,
    });
    expect(box.width).toBeLessThanOrEqual(256);
    expect(box.height).toBeLessThanOrEqual(300);
    expect(box.width / box.height).toBeCloseTo(GCASH_QR_ASPECT_RATIO);
    // Cover into the same box would fill 256×300 and clip the sides.
    expect(box.width).toBeLessThan(256);
    expect(box.height).toBe(300);
  });

  it("shrinks a wide plate to fit a tall box instead of cover-cropping", () => {
    const box = containFittedSize({ maxWidth: 400, maxHeight: 800, aspectRatio: 2 });
    expect(box.width).toBe(400);
    expect(box.height).toBe(200);
    expect(box.width).toBeLessThanOrEqual(400);
    expect(box.height).toBeLessThanOrEqual(800);
  });

  it("never produces a 1:1 tile for the GCash plate", () => {
    const box = containFittedSize({
      maxWidth: 300,
      maxHeight: 300,
      aspectRatio: GCASH_QR_ASPECT_RATIO,
    });
    expect(box.width / box.height).not.toBe(1);
    expect(box.width / box.height).toBeCloseTo(GCASH_QR_ASPECT_RATIO);
  });
});

describe("paymentQrPlateSize", () => {
  it("fits the whole plate inside the 90% sheet on a phone-sized window", () => {
    const window = { width: 390, height: 844 };
    const box = paymentQrPlateSize(window, 34);
    const sheetMax = window.height * QR_PAY_SHEET_MAX_HEIGHT_RATIO;
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeLessThanOrEqual(window.width);
    expect(box.height).toBeLessThan(sheetMax);
    expect(box.width / box.height).toBeCloseTo(GCASH_QR_ASPECT_RATIO);
    expect(box.width / box.height).not.toBe(1);
  });
});

describe("QrPaySheet", () => {
  it("contain-fits the bundled plate with explicit pixels, even when the 75% is not yet totalled", async () => {
    await renderInSafeArea(
      <QrPaySheet open onClose={() => {}} downpaymentMinor={null} />,
    );

    expect(screen.getByText("Not yet")).toBeTruthy();
    const image = screen.getByLabelText("GRIDGO's QR Ph code");
    expect(image).toBeTruthy();
    expect(image.props.resizeMode).toBe("contain");
    const style = flattenStyle(image.props.style);
    expect(typeof style.width).toBe("number");
    expect(typeof style.height).toBe("number");
    expect(style.width).toBeGreaterThan(0);
    expect(style.height).toBeGreaterThan(0);
    expect(style.aspectRatio).not.toBe(1);
    expect((style.width as number) / (style.height as number)).toBeCloseTo(GCASH_QR_ASPECT_RATIO);
    expect(style.overflow).not.toBe("hidden");
    expect(image.props.source).toBe(images.gcashQr);
  });

  it("uses the uploaded plate when settings carry imageUrl", async () => {
    await renderInSafeArea(
      <QrPaySheet
        open
        onClose={() => {}}
        downpaymentMinor={5175}
        imageUrl="/public/payment-qr?v=file_abc"
      />,
    );

    const image = screen.getByLabelText("GRIDGO's QR Ph code");
    expect(image.props.source).toEqual({
      uri: notificationImageUrl("/public/payment-qr?v=file_abc"),
    });
    expect(image.props.resizeMode).toBe("contain");
    const style = flattenStyle(image.props.style);
    expect(typeof style.width).toBe("number");
    expect(typeof style.height).toBe("number");
    expect(style.aspectRatio).not.toBe(1);
  });
});
