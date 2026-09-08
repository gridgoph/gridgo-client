import { buildMapHtml, externalPinScript, type MapModel } from "@/lib/mapHtml";

const model: MapModel = {
  theme: "light",
  pickup: { lat: 7.064, lng: 125.6085, label: "PrintRight Davao" },
  dropoff: { lat: 7.0853, lng: 125.6137, label: "Bajada, Davao City" },
  pickupLabel: "Print shop",
  dropoffLabel: "Your delivery address",
  routeCoordinates: [
    [125.6085, 7.064],
    [125.6137, 7.0853],
  ],
  routeColor: "#FFDE58",
  rider: { lat: 7.07, lng: 125.611 },
  riderStale: false,
  routeUnavailable: false,
};

describe("buildMapHtml", () => {
  it("uses OpenStreetMap tiles and no Google Maps", () => {
    const html = buildMapHtml(model);
    expect(html).toContain("tile.openstreetmap.org");
    expect(html.toLowerCase()).not.toContain("google");
    expect(html.toLowerCase()).not.toContain("api_key");
    expect(html.toLowerCase()).not.toContain("apikey");
  });

  it("keeps OSM attribution, which the tile licence requires", () => {
    expect(buildMapHtml(model)).toContain("openstreetmap.org/copyright");
  });

  it("pins Leaflet with subresource integrity", () => {
    const html = buildMapHtml(model);
    // Third-party script runs inside the app's WebView; a swapped CDN response
    // must not execute.
    expect(html).toMatch(/leaflet\.js"\s+integrity="sha384-[A-Za-z0-9+/=]+"/);
    expect(html).toMatch(/leaflet\.css"\s+integrity="sha384-[A-Za-z0-9+/=]+"/);
    expect(html).toContain('crossorigin="anonymous"');
  });

  it("swaps to dark tiles with their own attribution", () => {
    const dark = buildMapHtml({ ...model, theme: "dark" });
    expect(dark).toContain("basemaps.cartocdn.com/dark_all");
    expect(dark).toContain("carto.com/attributions");
  });

  it("carries the model into the document", () => {
    const html = buildMapHtml(model);
    expect(html).toContain('"riderStale":false');
    expect(html).toContain("125.6085");
  });

  it("escapes angle brackets so a label cannot break out of the script", () => {
    const html = buildMapHtml({
      ...model,
      dropoffLabel: "</script><img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c");
  });

  it("uses the design system's route colour and leaves pins monochrome", () => {
    const html = buildMapHtml(model);
    // Yellow is a finite budget; on this screen the route line spends it.
    expect(html).toContain('"routeColor":"#FFDE58"');
    expect(html).not.toContain("background: #FFDE58");
  });

  it("can move a pin from the host without rebuilding the document", () => {
    const html = buildMapHtml(model);
    expect(html).toContain("function setExternalPin");
    expect(externalPinScript({ lat: 7.073, lng: 125.613 })).toContain("7.073");
    expect(externalPinScript({ lat: 7.073, lng: 125.613 })).toContain("125.613");
  });

  it("draws the drop-off as the rider's teardrop, client skin, standing on the street", () => {
    const html = buildMapHtml(model);
    expect(html).toContain("M17 45.6C17 45.6 3.2 27.9 3.2 17.6A13.8 13.8 0 1 1 30.8 17.6C30.8 27.9 17 45.6 17 45.6Z");
    expect(html).toContain("fill: '#FFFFFF'");
    expect(html).toContain("stroke: '#1a1a1a'");
    expect(html).toContain("iconAnchor: [17, 45]");
    expect(html).toContain("pin-tip");
    expect(html).not.toMatch(/\.pin-dropoff \.pin-mark/);
  });
});
