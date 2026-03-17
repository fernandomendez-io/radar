import { NextResponse } from "next/server";

export async function GET() {
  const url = "https://aviationweather.gov/api/data/metar?ids=KDFW&format=json";
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "METAR Fetch Failed" }, { status: 500 });
  }
}
