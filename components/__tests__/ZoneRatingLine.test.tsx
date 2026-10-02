import { render, screen } from "@testing-library/react-native";

import { DeliveryZonesHelp } from "@/components/DeliveryZonesHelp";
import { ZoneRatingLine } from "@/components/ZoneRatingLine";

const ZONES = [
  { zone: "nearby", label: "Nearby", maxDistanceMeters: 5000, feeMinor: 2500 },
  { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: 5000 },
  { zone: "long_distance", label: "Long Distance", maxDistanceMeters: 15000, feeMinor: 7500 },
  { zone: "out_of_zone", label: "Out of Zone", maxDistanceMeters: null, baseFeeMinor: 7500, perKmMinor: 1000 },
];

describe("ZoneRatingLine", () => {
  it("draws the zone word and the rating", async () => {
    await render(
      <ZoneRatingLine zone={{ key: "away", label: "Away" }} rating={{ average: 4.25, count: 8 }} />,
    );
    expect(screen.getByText("Away")).toBeTruthy();
    expect(screen.getByText("4.3 (8)")).toBeTruthy();
    expect(screen.getByLabelText("Away, Rated 4.3 out of 5 from 8 reviews")).toBeTruthy();
  });

  it("leaves the rating out below the review threshold (the API sends none)", async () => {
    await render(<ZoneRatingLine zone={{ key: "nearby", label: "Nearby" }} rating={undefined} />);
    expect(screen.getByText("Nearby")).toBeTruthy();
    expect(screen.queryByLabelText(/Rated/)).toBeNull();
  });

  it("shows kilometres on Out of Zone only", async () => {
    await render(
      <>
        <ZoneRatingLine zone={{ key: "nearby", label: "Nearby" }} distanceKm={2.3} rating={undefined} />
        <ZoneRatingLine
          zone={{ key: "out_of_zone", label: "Out of Zone" }}
          distanceKm={16}
          rating={undefined}
        />
      </>,
    );
    expect(screen.getByText("Nearby")).toBeTruthy();
    expect(screen.queryByText(/2\.3/)).toBeNull();
    expect(screen.getByText("Out of Zone · 16.0 km")).toBeTruthy();
  });

  it("draws nothing with neither a zone nor a rating", async () => {
    await render(<ZoneRatingLine zone={null} rating={undefined} />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe("DeliveryZonesHelp", () => {
  it("lists the four zones with their ranges and prices", async () => {
    await render(<DeliveryZonesHelp settings={{ deliveryFeeBands: ZONES }} initiallyOpen />);
    expect(screen.getByLabelText("Nearby, Up to 5 km, ₱25.00")).toBeTruthy();
    expect(screen.getByLabelText("Away, 5–10 km, ₱50.00")).toBeTruthy();
    expect(screen.getByLabelText("Long Distance, 10–15 km, ₱75.00")).toBeTruthy();
    expect(screen.getByLabelText("Out of Zone, Over 15 km, ₱75.00 + ₱10.00 per km")).toBeTruthy();
    expect(screen.getByText(/every started kilometre of the whole trip/)).toBeTruthy();
  });

  it("is not drawn for an API whose bands have no names", async () => {
    await render(
      <DeliveryZonesHelp settings={{ deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }] }} />,
    );
    expect(screen.queryByText("How does delivery distance work?")).toBeNull();
  });
});
