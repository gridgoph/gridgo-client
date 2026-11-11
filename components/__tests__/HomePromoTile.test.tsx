import { render, screen } from "@testing-library/react-native";
import { Appearance, StyleSheet, type ViewStyle } from "react-native";

import { HomePromoTile } from "@/components/HomePromoTile";
import { colors } from "@/constants/theme";
import type { HomePromotion } from "@/lib/homePromos";

// Exercise the installed native CSS interop rather than RN-web or RNTL's already-evaluated host view.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getStyledProps } = require("../../node_modules/react-native-css/dist/commonjs/native/styles/index.js") as {
  getStyledProps: (
    ruleSet: {
      configs: { source: string; target: string[] }[];
      stylesObs: { get: () => { normal: { style: ViewStyle } } };
      styleEffect: Record<string, never>;
      ruleEffectGetter: () => void;
    },
    props: Record<string, unknown>,
  ) => { style: unknown };
};

let capturedPromoPressableProps: Record<string, unknown> | null = null;

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  const copy = Object.create(null, Object.getOwnPropertyDescriptors(RN));
  Object.defineProperty(copy, "Pressable", {
    configurable: true,
    value: React.forwardRef(function MockPressable(props: Record<string, unknown>, ref: unknown) {
      if (typeof props.testID === "string" && props.testID.startsWith("promo-tile-")) {
        capturedPromoPressableProps = props;
      }
      return React.createElement(RN.Pressable, { ...props, ref });
    }),
  });
  return copy;
});

/** The card's link line, tag and colour on Home (gridgo-client#402, #419, #423). */

beforeEach(() => {
  capturedPromoPressableProps = null;
});

afterEach(() => {
  jest.restoreAllMocks();
});

function promo(overrides: Partial<HomePromotion> = {}): HomePromotion {
  return {
    id: "promo_davaogo",
    name: "DavaoGo",
    logoUrl: null,
    cardImageUrl: null,
    imageUrl: null,
    description: "",
    tag: "sponsored",
    linkText: "Plan your commute",
    linkUrl: "https://davaogo.example",
    tapAction: "sheet",
    style: "light",
    color: null,
    ...overrides,
  };
}

function resolveNativePressableStyle(rawProps: Record<string, unknown>): ViewStyle {
  const merged = getStyledProps(
    {
      configs: [{ source: "className", target: ["style"] }],
      stylesObs: { get: () => ({ normal: { style: { padding: 12, borderWidth: 1, borderRadius: 16 } } }) },
      styleEffect: {},
      ruleEffectGetter: () => {},
    },
    rawProps,
  );
  // React Native's Pressable.js:339 only invokes `style` when `typeof style === "function"`.
  const resolved =
    typeof merged.style === "function"
      ? (merged.style as (state: { pressed: boolean }) => unknown)({ pressed: false })
      : merged.style;
  return StyleSheet.flatten(resolved as ViewStyle) ?? {};
}

it("lets the link text, name and tag wrap without line-cap truncation at large font scales", async () => {
  await render(<HomePromoTile promo={promo({ style: "yellow" })} onPress={() => {}} />);
  const line = screen.getByText("Plan your commute");
  expect(line.props.numberOfLines).toBeUndefined();
  expect(line.props.ellipsizeMode).toBeUndefined();
  expect(screen.getByText("DavaoGo").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("Sponsored").props.numberOfLines).toBeUndefined();
});

it("draws nothing extra when Operations wrote no link text", async () => {
  await render(<HomePromoTile promo={promo({ linkText: "" })} onPress={() => {}} />);
  expect(screen.getByText("DavaoGo")).toBeTruthy();
  expect(screen.queryByTestId("promo-tile-link")).toBeNull();
});

it("labels the tag chip and the name for a reader", async () => {
  await render(<HomePromoTile promo={promo({ color: "#17A673", tapAction: "link" })} onPress={() => {}} />);
  expect(screen.getByLabelText("DavaoGo. Sponsored")).toBeTruthy();
  expect(screen.getByText("Sponsored")).toBeTruthy();
});

it("draws the link text in 72% ink and the arrow in full ink", async () => {
  await render(<HomePromoTile promo={promo({ color: "#FFFFFF" })} onPress={() => {}} />);
  expect(screen.getByTestId("promo-tile-link-text")).toHaveStyle({ color: "#1A1A1AB8" });
});

it("preserves #FFFFFF promo background and readable dark ink after native className/inline style merge in Dark and Light themes", async () => {
  jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
  await render(<HomePromoTile promo={promo({ color: "#FFFFFF", style: "light" })} onPress={() => {}} />);

  expect(capturedPromoPressableProps).not.toBeNull();
  const darkFlattened = resolveNativePressableStyle(capturedPromoPressableProps!);
  expect(darkFlattened.backgroundColor).toBe("#FFFFFF");
  expect(darkFlattened.borderColor).toBe("#FFFFFF");
  expect(screen.getByText("DavaoGo")).toHaveStyle({ color: "#1A1A1A" });
  expect(screen.getByTestId("promo-tile-link-text")).toHaveStyle({ color: "#1A1A1AB8" });
  expect(screen.getByTestId("promo-tile-tag")).toHaveStyle({ backgroundColor: "#1A1A1A1A" });

  jest.spyOn(Appearance, "getColorScheme").mockReturnValue("light");
  await render(<HomePromoTile promo={promo({ color: "#FFFFFF", style: "light" })} onPress={() => {}} />);

  expect(capturedPromoPressableProps).not.toBeNull();
  const lightFlattened = resolveNativePressableStyle(capturedPromoPressableProps!);
  expect(lightFlattened.backgroundColor).toBe("#FFFFFF");
  expect(lightFlattened.borderColor).toBe(colors.light.outline);
  expect(screen.getByText("DavaoGo")).toHaveStyle({ color: "#1A1A1A" });
});
