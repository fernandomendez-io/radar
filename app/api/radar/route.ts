import { NextResponse } from "next/server";

export async function GET() {
  // Use Environment Variables for Production
  const clientId =
    process.env.OPENSKY_CLIENT_ID || "fernandomendezio-api-client";
  const clientSecret =
    process.env.OPENSKY_CLIENT_SECRET || "zu27YwZxq4t9Rz5lohuY5c856S5HFFC3";

  const tokenUrl =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
  const dataUrl =
    "https://opensky-network.org/api/states/all?lamin=32.0&lomin=-98.0&lamax=34.0&lomax=-96.0";

  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const authRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "FernandoRadar/1.0", // Added for production reliability
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: body.toString(),
      cache: "no-store",
    });

    if (!authRes.ok) {
      const errorText = await authRes.text();
      console.error("❌ OAuth Token Error:", errorText);
      return NextResponse.json(
        { error: "Auth Failed", detail: errorText },
        { status: 401 },
      );
    }

    const { access_token } = await authRes.json();

    const res = await fetch(dataUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
        "User-Agent": "FernandoRadar/1.0",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`OpenSky Data Error: ${res.status}`);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("❌ Production Proxy Crash:", error.message);
    return NextResponse.json(
      { error: "Internal Server Error", message: error.message },
      { status: 500 },
    );
  }
}
