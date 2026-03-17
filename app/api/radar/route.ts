import { NextResponse } from "next/server";

export async function GET() {
  const clientId = "fernandomendezio-api-client";
  const clientSecret = "zu27YwZxq4t9Rz5lohuY5c856S5HFFC3";

  // Updated endpoint for OpenSky Network OAuth2
  const tokenUrl =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
  const dataUrl =
    "https://opensky-network.org/api/states/all?lamin=32.0&lomin=-98.0&lamax=34.0&lomax=-96.0";

  try {
    // 1. Get the OAuth2 Access Token
    // We use URLSearchParams to ensure the correct x-www-form-urlencoded format
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const authRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Fallback: Some systems prefer credentials here as a Basic header
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: body.toString(),
      cache: "no-store",
    });

    if (!authRes.ok) {
      const errorText = await authRes.text();
      console.error("❌ OAuth Token Error:", errorText);
      return NextResponse.json(
        { error: "OAuth Authentication Failed", detail: errorText },
        { status: 401 },
      );
    }

    const { access_token } = await authRes.json();

    // 2. Fetch Radar Data with the Bearer Token
    const res = await fetch(dataUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`OpenSky Data Request Failed: ${res.status}`);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("❌ Radar Proxy Crash:", error.message);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
