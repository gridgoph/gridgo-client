import { buildMapHtml, externalPinScript, PIN_ZOOM, pickerMapModel, setPinMessage } from "@/lib/mapHtml";

const picker = (point: { lat: number; lng: number } | null, accuracyMeters?: number | null) =>
  buildMapHtml(pickerMapModel({ theme: "light", point, accuracyMeters, routeColor: "#FFDE58" }));

describe("drop-off picker map", () => {
  it("opens an empty map on downtown Davao, not Calinan", () => {
    const html = picker(null);
    expect(html).toContain("map.setView([7.0731, 125.6128], 13)");
    expect(html).not.toContain("7.1907");
  });

  it("lets the pin be dragged, only where the client is choosing it", () => {
    const html = picker({ lat: 7.06, lng: 125.59 });
    expect(html).toContain("draggable: !!m.pickable");
    expect(html).toContain("dropMarker.on('dragend'");
    expect(pickerMapModel({ theme: "light", point: null, routeColor: "#000" }).pickable).toBe(true);
  });

  it("comes in close enough to see the building on a pin", () => {
    expect(PIN_ZOOM).toBeGreaterThanOrEqual(18);
    expect(picker({ lat: 7.06, lng: 125.59 })).toContain(`map.setView(bounds[0], ${PIN_ZOOM})`);
  });

  it("draws the phone's error circle and forgets it once the client places the pin", () => {
    const html = picker({ lat: 7.06, lng: 125.59 }, 85);
    expect(html).toContain('"accuracyMeters":85');
    expect(html).toContain("L.circle(");
    expect(html).toContain("MODEL.accuracyMeters = null;");
  });

  it("moves the pin from the host with its accuracy, on native and on web", () => {
    expect(externalPinScript({ lat: 7.1, lng: 125.6 }, 42.4)).toBe(
      "try { setExternalPin(7.1, 125.6, 42); } catch (e) {} true;",
    );
    expect(externalPinScript({ lat: 7.1, lng: 125.6 })).toBe(
      "try { setExternalPin(7.1, 125.6, null); } catch (e) {} true;",
    );
    expect(JSON.parse(setPinMessage({ lat: 7.1, lng: 125.6 }, 30))).toEqual({
      type: "setPin",
      lat: 7.1,
      lng: 125.6,
      accuracy: 30,
    });
    expect(picker(null)).toContain("data.type === 'setPin'");
  });
});
