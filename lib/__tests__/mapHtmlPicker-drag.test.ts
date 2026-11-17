import { runInNewContext } from "node:vm";

import { buildMapHtml, parseMapMessage, pickerMapModel } from "@/lib/mapHtml";

it("keeps the held marker and viewport when a host update races dragstart", () => {
  const model = pickerMapModel({ theme: "light", point: { lat: 7.0731, lng: 125.6128 }, accuracyMeters: 8, routeColor: "#FFDE58" });
  const html = buildMapHtml(model);
  const events: Record<string, () => void> = {};
  const send = jest.fn();
  const map = {
    on: jest.fn(), removeLayer: jest.fn(), setView: jest.fn(),
    getContainer: () => ({ addEventListener: jest.fn(), querySelectorAll: () => [] }),
  };
  const marker = {
    addTo: () => marker,
    on: (name: string, handler: () => void) => { events[name] = handler; },
    getElement: () => ({ classList: { add: jest.fn() } }),
    getLatLng: () => ({ lat: 7.074, lng: 125.614 }),
  };
  const layer = { addTo: () => layer };
  const L = {
    map: () => map, control: { zoom: () => layer }, tileLayer: () => layer,
    marker: jest.fn(() => marker), circle: () => layer, divIcon: jest.fn(),
  };
  const context = {
    L,
    window: { ReactNativeWebView: { postMessage: send }, addEventListener: jest.fn() },
    document: {
      body: { className: "" }, getElementById: () => ({ style: {} }),
      querySelector: () => null, addEventListener: jest.fn(),
    },
  };
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeTruthy();
  runInNewContext(script!, context);
  map.setView.mockClear();
  events.dragstart();
  expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "grab" }));
  expect(parseMapMessage(send.mock.calls[0][0])).toEqual({ type: "grab" });
  // Even an already queued host update cannot tear down the marker in hand.
  runInNewContext("setExternalPin(7.09, 125.62, 8)", context);
  runInNewContext(`applyModel(${JSON.stringify({ ...model, accuracyMeters: null })})`, context);
  expect(L.marker).toHaveBeenCalledTimes(1);
  expect(map.removeLayer).not.toHaveBeenCalledWith(marker);
  expect(map.setView).not.toHaveBeenCalled();
  events.dragend();
  expect(send).toHaveBeenLastCalledWith(JSON.stringify({ type: "pin", lat: 7.074, lng: 125.614 }));
});
