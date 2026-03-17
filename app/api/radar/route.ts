import https from "https";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Required to use the native https module

// 1. Custom HTTPS Wrapper to bypass Vercel's broken fetch()
const secureRequest = (
  urlStr: string,
  method: "GET" | "POST",
  bodyData?: string,
  token?: string,
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers: Record<string, string> = {
      "User-Agent": "FernandoRadar/1.1 (Pilot Dashboard)",
      Accept: "application/json",
    };

    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (bodyData) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      headers["Content-Length"] = Buffer.byteLength(bodyData).toString();
    }

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: headers,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} - ${data}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        }
      });
    });

    req.on("error", (e) => reject(e));
    if (bodyData) req.write(bodyData);
    req.end();
  });
};

// 2. The Main Proxy Route
export async function GET() {
  const tokenUrl =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
  const dataUrl =
    "https://opensky-network.org/api/states/all?lamin=32.0&lomin=-98.0&lamax=34.0&lomax=-96.0";

  try {
    // Step 1: OAuth Handshake (Using raw HTTPS)
    const bodyParams = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.OPENSKY_CLIENT_ID || "",
      client_secret: process.env.OPENSKY_CLIENT_SECRET || "",
    }).toString();

    const authRes = await secureRequest(tokenUrl, "POST", bodyParams);

    if (!authRes.access_token) {
      throw new Error("No token returned. Check Vercel Environment Variables.");
    }

    // Step 2: Fetch the DFW Sector Data
    const dataRes = await secureRequest(
      dataUrl,
      "GET",
      undefined,
      authRes.access_token,
    );

    return Response.json(dataRes);
  } catch (error: any) {
    console.error("💀 Native HTTPS Crash:", error.message);
    return Response.json(
      { error: "System Error", details: error.message },
      { status: 500 },
    );
  }
}
