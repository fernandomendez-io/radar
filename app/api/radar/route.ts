export const runtime = "nodejs"; // Forces Node.js instead of Edge

export async function GET() {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  const tokenUrl =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
  const dataUrl =
    "https://opensky-network.org/api/states/all?lamin=32.0&lomin=-98.0&lamax=34.0&lomax=-96.0";

  try {
    console.log("Starting OAuth Handshake...");
    const authRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "User-Agent": "FernandoRadar/1.0",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });

    if (!authRes.ok) {
      const errText = await authRes.text();
      console.error("❌ OAuth Step 1 Failed:", errText);
      return Response.json({ step: 1, error: errText }, { status: 401 });
    }

    const { access_token } = await authRes.json();
    console.log("✅ Token Acquired. Fetching planes...");

    const res = await fetch(dataUrl, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "User-Agent": "FernandoRadar/1.0",
      },
    });

    if (!res.ok) {
      console.error("❌ OAuth Step 2 Failed:", res.status);
      return Response.json(
        { step: 2, status: res.status },
        { status: res.status },
      );
    }

    const data = await res.json();
    return Response.json(data);
  } catch (error: any) {
    console.error("💀 Network Crash:", error.message);
    return Response.json(
      { error: "fetch failed", message: error.message },
      { status: 500 },
    );
  }
}
