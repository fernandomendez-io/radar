import { NextResponse } from "next/server";

export async function GET() {
  // Bounding box for DFW area (min lat, min lon, max lat, max lon)
  const LAMBDA_DFW = {
    lamin: 32.5,
    lomin: -97.5,
    lamax: 33.5,
    lomax: -96.5,
  };

  try {
    const response = await fetch(
      `https://opensky-network.org/api/states/all?lamin=${LAMBDA_DFW.lamin}&lomin=${LAMBDA_DFW.lomin}&lamax=${LAMBDA_DFW.lamax}&lomax=${LAMBDA_DFW.lomax}`,
      { next: { revalidate: 10 } }, // Re-fetch every 10 seconds
    );

    const data = await response.json();

    // Map the raw OpenSky array into a readable format
    const flights = (data.states || []).map((s: any) => ({
      icao24: s[0],
      callsign: s[1].trim(),
      origin_country: s[2],
      longitude: s[5],
      latitude: s[6],
      altitude: s[7], // Barometric altitude in meters
      velocity: s[9], // Velocity in m/s
      heading: s[10],
    }));

    return NextResponse.json(flights);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
