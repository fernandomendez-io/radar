export const runtime = "nodejs";

export async function GET() {
  // 1. Correct URLs from the official 2026 OpenSky REST API docs
  const tokenUrl =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
  const dataUrl =
    "https://opensky-network.org/api/states/all?lamin=32.0&lomin=-98.0&lamax=34.0&lomax=-96.0";

  try {
    // 2. Official OpenSky fetch method: Credentials in the BODY
    const body = new URLSearchParams();
    body.append("grant_type", "client_credentials");
    body.append("client_id", process.env.OPENSKY_CLIENT_ID || "");
    body.append("client_secret", process.env.OPENSKY_CLIENT_SECRET || "");

    const authRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });

    if (!authRes.ok) {
      const errorText = await authRes.text();
      return Response.json(
        { error: "Auth Step 1 Fail", details: errorText },
        { status: 401 },
      );
    }

    const { access_token } = await authRes.json();

    // 3. Fetch Data with the new token
    const res = await fetch(dataUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
      cache: "no-store",
    });

    const data = await res.json();
    return Response.json(data);
  } catch (error: any) {
    // If it still says "fetch failed", it means DNS is failing to find 'auth.opensky-network.org'
    return Response.json(
      { error: "fetch failed", message: error.message },
      { status: 500 },
    );
  }
}
