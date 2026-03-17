import { NextResponse } from "next/server";

let cachedToken = { value: "", expires: 0 };

export async function GET() {
  try {
    // Reuse token if still valid
    if (Date.now() < cachedToken.expires) {
      console.log("Using cached OpenSky token");
    } else {
      const tokenRes = await fetch(
        "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.OPENSKY_CLIENT_ID!,
            client_secret: process.env.OPENSKY_CLIENT_SECRET!,
          }),
        },
      );

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error("Token fetch failed:", tokenRes.status, text);
        return NextResponse.json(
          { error: "OpenSky auth failed", detail: text },
          { status: 502 },
        );
      }

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        console.error("No access_token in response:", tokenData);
        return NextResponse.json(
          { error: "No access_token returned", detail: tokenData },
          { status: 502 },
        );
      }

      // Cache for 90% of token lifetime (expires_in is in seconds)
      const lifetime = (tokenData.expires_in || 300) * 1000 * 0.9;
      cachedToken = {
        value: tokenData.access_token,
        expires: Date.now() + lifetime,
      };
    }

    const dataRes = await fetch(
      "https://opensky-network.org/api/states/all?lamin=32.0&lomin=-98.0&lamax=34.0&lomax=-96.0",
      {
        headers: { Authorization: `Bearer ${cachedToken.value}` },
        next: { revalidate: 0 },
      },
    );

    if (!dataRes.ok) {
      const text = await dataRes.text();
      console.error("OpenSky data fetch failed:", dataRes.status, text);
      return NextResponse.json(
        {
          error: "OpenSky data fetch failed",
          status: dataRes.status,
          detail: text,
        },
        { status: 502 },
      );
    }

    const data = await dataRes.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("flights route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
