import { dragPanel, panelGeometry, settlePanel } from "@/lib/trackingPanel";

describe("panelGeometry", () => {
  it("rests the panel on its content and leaves the map most of the screen", () => {
    const { peek, height, travel } = panelGeometry(760, 240);
    expect(peek).toBe(240);
    expect(peek / 760).toBeLessThan(0.35);
    expect(height).toBe(760 - 72);
    expect(travel).toBe(height - peek);
  });

  it("never lets large text push the map under half the screen", () => {
    expect(panelGeometry(760, 600).peek).toBe(380);
  });

  it("never rests so low the steps cannot show", () => {
    expect(panelGeometry(760, 80).peek).toBe(Math.round(760 * 0.26));
  });
});

describe("settlePanel", () => {
  it("lets a flick decide", () => {
    expect(settlePanel(400, -0.8, 450)).toBe("expanded");
    expect(settlePanel(10, 0.8, 450)).toBe("collapsed");
  });

  it("otherwise settles on the nearer stop", () => {
    expect(settlePanel(100, 0, 450)).toBe("expanded");
    expect(settlePanel(300, 0.1, 450)).toBe("collapsed");
  });
});

describe("dragPanel", () => {
  it("follows the finger between the stops and resists past them", () => {
    expect(dragPanel(450, -100, 450)).toBe(350);
    expect(dragPanel(0, -40, 450)).toBe(-10);
    expect(dragPanel(450, 40, 450)).toBe(460);
  });
});
