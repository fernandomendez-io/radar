import { NextResponse } from "next/server";

export async function GET() {
  const auth = "Basic ZmVybmFuZG9tZW5kZXppbzpwYXR4ZTAtR2lxbWFzLXFva3Nvcw==";
  // Slightly wider DFW box to ensure we catch arrivals from farther out
  const url =
    "https://opensky-network.org/api/states/all?lamin=32.0&lomin=-98.0&lamax=34.0&lomax=-96.0";

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: auth,
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      console.error(`OpenSky error: ${res.status}`);
      return NextResponse.json(
        { error: "OpenSky denied access", states: [] },
        { status: res.status },
      );
    }

    const data = await res.json();
    console.log(`Fetched ${data.states?.length || 0} targets from OpenSky`);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Proxy Failed", states: [] },
      { status: 500 },
    );
  }
}
