"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface Flight {
  icao24: string;
  callsign: string;
  longitude: number;
  latitude: number;
  altitude: number;
  on_ground: boolean;
  velocity: number;
  heading: number;
}

interface MetarData {
  raw: string;
  category: "VFR" | "MVFR" | "IFR" | "LIFR" | "UNK";
  color: string;
}

export default function TacticalMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ [key: string]: maplibregl.Marker }>({});
  const [flights, setFlights] = useState<Flight[]>([]);
  const trails = useRef<{ [key: string]: [number, number][] }>({});
  const [zuluTime, setZuluTime] = useState("");
  const [metar, setMetar] = useState<MetarData>({
    raw: "LOADING METAR...",
    category: "UNK",
    color: "#666",
  });

  // 1. ZULU CLOCK TIMER
  useEffect(() => {
    const timer = setInterval(() => {
      setZuluTime(new Date().toISOString().substring(11, 19) + "Z");
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. INITIALIZE MAP
  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          "raster-tiles": {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© CARTO",
          },
        },
        layers: [
          {
            id: "simple-tiles",
            type: "raster",
            source: "raster-tiles",
            minzoom: 0,
            maxzoom: 18,
          },
        ],
      },
      center: [-97.0403, 32.8982],
      zoom: 10,
    });

    mapInstance.on("load", () => {
      map.current = mapInstance;
      mapInstance.addSource("plane-trails", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      mapInstance.addLayer({
        id: "plane-trails-layer",
        type: "line",
        source: "plane-trails",
        paint: {
          "line-color": "#10b981",
          "line-width": 2,
          "line-opacity": 0.4,
          "line-dasharray": [2, 1],
        },
      });
    });
    return () => mapInstance.remove();
  }, []);

  // 3. METAR & RADAR FETCH (Every 15s to avoid 429)
  useEffect(() => {
    const fetchData = async () => {
      // --- FETCH METAR ---
      try {
        const mRes = await fetch(
          "https://avwx.rest/api/metar/KDFW?token=YOUR_TOKEN_OPTIONAL",
          {
            headers: { Authorization: "BEARER YOUR_TOKEN_IF_NEEDED" }, // AVWX or check CheckWX
          },
        );
        // Note: For simplicity without a token, many use the aviationweather.gov text API
        const mResText = await fetch(
          "https://www.aviationweather.gov/cgi-bin/data/metar.php?ids=KDFW",
        );
        const rawMetar = await mResText.text();

        let cat: MetarData["category"] = "VFR";
        let color = "#10b981"; // Green

        if (rawMetar.includes(" OVC00") || rawMetar.includes(" VV00")) {
          cat = "LIFR";
          color = "#f472b6";
        } else if (
          rawMetar.includes(" OVC005") ||
          rawMetar.includes(" OVC009")
        ) {
          cat = "IFR";
          color = "#ef4444";
        } else if (
          rawMetar.includes(" BKN01") ||
          rawMetar.includes(" BKN02") ||
          rawMetar.includes(" OVC01") ||
          rawMetar.includes(" OVC02")
        ) {
          cat = "MVFR";
          color = "#60a5fa";
        }

        setMetar({
          raw: rawMetar.trim().substring(0, 50) + "...",
          category: cat,
          color,
        });
      } catch (e) {
        console.error("METAR Fail");
      }

      // --- FETCH RADAR ---
      try {
        const res = await fetch(
          "https://opensky-network.org/api/states/all?lamin=32.5&lomin=-97.5&lamax=33.5&lomax=-96.5",
        );
        const rawData = await res.json();
        const data: Flight[] = (rawData.states || []).map((s: any) => ({
          icao24: s[0],
          callsign: s[1].trim() || "UNK",
          longitude: s[5],
          latitude: s[6],
          altitude: s[7] || 0,
          on_ground: s[8],
          velocity: s[9] || 0,
          heading: s[10] || 0,
        }));
        setFlights(data);
      } catch (e) {
        console.error("Radar 429");
      }
    };

    const interval = setInterval(fetchData, 15000);
    fetchData();
    return () => clearInterval(interval);
  }, []);

  // 4. INTERPOLATION "NUDGE" (Every 1s)
  useEffect(() => {
    const nudge = setInterval(() => {
      setFlights((prev) =>
        prev.map((f) => {
          if (f.on_ground || f.velocity === 0) return f;
          const R = 6378137;
          const d = f.velocity; // distance moved in 1s
          const brng = (f.heading * Math.PI) / 180;
          const lat1 = (f.latitude * Math.PI) / 180;
          const lon1 = (f.longitude * Math.PI) / 180;
          const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(d / R) +
              Math.cos(lat1) * Math.sin(d / R) * Math.cos(brng),
          );
          const lon2 =
            lon1 +
            Math.atan2(
              Math.sin(brng) * Math.sin(d / R) * Math.cos(lat1),
              Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2),
            );

          const newLon = (lon2 * 180) / Math.PI;
          const newLat = (lat2 * 180) / Math.PI;

          if (markers.current[f.icao24]) {
            markers.current[f.icao24].setLngLat([newLon, newLat]);
          }
          return { ...f, longitude: newLon, latitude: newLat };
        }),
      );
    }, 1000);
    return () => clearInterval(nudge);
  }, []);

  // 5. MARKER SYNCHRONIZATION
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    flights.forEach((f) => {
      const isCompany =
        f.callsign.startsWith("ENY") || f.callsign.startsWith("AAL");
      const altFt = Math.round(f.altitude * 3.28084);
      const kts = Math.round(f.velocity * 1.944);
      const color = isCompany ? "#60a5fa" : "#10b981";

      if (markers.current[f.icao24]) {
        const el = markers.current[f.icao24].getElement();
        const label = el.querySelector(".radar-label") as HTMLElement;
        if (label)
          label.innerHTML = `${f.callsign}<br>${altFt.toLocaleString()}FT<br>${kts}KT`;
      } else {
        const el = document.createElement("div");
        el.className = "radar-blip-container";
        el.innerHTML = `
          <div class="radar-dot" style="width:10px; height:10px; background:${color}; border-radius:50%; box-shadow: 0 0 10px ${color}66;"></div>
          <div class="radar-label" style="position: absolute; left: 14px; top: -8px; color: ${color}; font-family: monospace; font-size: 10px; text-shadow: 2px 2px 2px black; pointer-events: none;">
            ${f.callsign}<br>${altFt.toLocaleString()}FT<br>${kts}KT
          </div>
        `;
        markers.current[f.icao24] = new maplibregl.Marker({ element: el })
          .setLngLat([f.longitude, f.latitude])
          .addTo(map.current!);
      }
    });

    // Cleanup dead markers
    const currentIds = flights.map((f) => f.icao24);
    Object.keys(markers.current).forEach((id) => {
      if (!currentIds.includes(id)) {
        markers.current[id].remove();
        delete markers.current[id];
      }
    });
  }, [flights]);

  return (
    <main className="relative w-screen h-screen bg-[#0a0a0a] overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* HUD Overlay */}
      <div className="absolute top-6 left-6 z-10 p-4 border border-emerald-900 bg-black/80 font-mono min-w-[220px]">
        <h1 className="text-emerald-500 text-lg font-bold italic border-b border-emerald-900/50 mb-1">
          DFW RADAR
        </h1>
        <p className="text-emerald-400 text-2xl font-bold tracking-tighter tabular-nums">
          {zuluTime}
        </p>

        {/* METAR SECTION */}
        <div
          className="mt-2 py-1 px-2 border-l-2"
          style={{ borderColor: metar.color }}
        >
          <p className="text-[10px] uppercase text-emerald-800 font-bold">
            KDFW METAR {metar.category}
          </p>
          <p
            className="text-[9px] leading-tight"
            style={{ color: metar.color }}
          >
            {metar.raw}
          </p>
        </div>

        <p className="text-emerald-800 text-[10px] mt-2 uppercase tracking-widest">
          Targets: {flights.length}
        </p>
      </div>

      <div className="absolute inset-0 pointer-events-none z-20 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
    </main>
  );
}
