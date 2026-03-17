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

  // 3. UNIFIED METAR & RADAR FETCH
  useEffect(() => {
    const fetchData = async () => {
      // --- FETCH METAR ---
      try {
        const mRes = await fetch("/api/metar");
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData && mData.length > 0) {
            const kdfw = mData[0];
            const category = kdfw.fltCat || "VFR";
            const colorMap: any = {
              VFR: "#10b981",
              MVFR: "#60a5fa",
              IFR: "#ef4444",
              LIFR: "#f472b6",
            };
            setMetar({
              raw: kdfw.rawOb,
              category: category,
              color: colorMap[category] || "#666",
            });
          }
        }
      } catch (e) {
        console.warn("METAR Proxy Error:", e);
      }

      // --- FETCH RADAR ---
      try {
        const res = await fetch("/api/radar");
        if (!res.ok) {
          const errorDetail = await res.json();
          console.error("API Proxy Error:", res.status, errorDetail);
          return;
        }

        const rawData = await res.json();
        if (!rawData.states) {
          console.warn("Radar connected, but no states returned.");
          setFlights([]);
          return;
        }

        const data: Flight[] = rawData.states.map((s: any) => ({
          icao24: s[0],
          callsign: (s[1] || "UNK").trim(),
          longitude: s[5],
          latitude: s[6],
          altitude: s[7] || 0,
          on_ground: s[8],
          velocity: s[9] || 0,
          heading: s[10] || 0,
        }));

        setFlights(data);
      } catch (e) {
        console.error("Radar Fetch Error:", e);
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
          const d = f.velocity;
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

  // 5. MARKER & POPUP SYNCHRONIZATION
  useEffect(() => {
    if (!map.current) return;

    flights.forEach((f) => {
      const isCompany =
        f.callsign.startsWith("ENY") || f.callsign.startsWith("AAL");
      const altFt = Math.round(f.altitude * 3.28084);
      const kts = Math.round(f.velocity * 1.944);

      const isLow = f.on_ground || altFt < 600;
      const color = isCompany ? "#60a5fa" : "#10b981";
      const size = isLow ? "4px" : "10px";
      const opacity = isLow ? "0.3" : "1";
      const labelDisplay = !isLow || isCompany ? "block" : "none";

      // 1. Define the Popup Content
      const popupHTML = `
        <div style="background: rgba(0,0,0,0.9); border: 1px solid ${color}; padding: 8px; font-family: monospace; color: ${color}; min-width: 140px; box-shadow: 0 0 15px ${color}44;">
          <b style="border-bottom: 1px solid ${color}44; display: block; margin-bottom: 4px; font-size: 12px;">${f.callsign || "ADS-B UNK"}</b>
          <div style="font-size: 10px; line-height: 1.4;">
            ALT: <span style="color: #fff;">${altFt.toLocaleString()} FT</span><br>
            SPD: <span style="color: #fff;">${kts} KTS</span><br>
            HDG: <span style="color: #fff;">${Math.round(f.heading)}°</span><br>
            ICAO: <span style="color: #666;">${f.icao24.toUpperCase()}</span>
          </div>
        </div>`;

      if (markers.current[f.icao24]) {
        const marker = markers.current[f.icao24];
        marker.setLngLat([f.longitude, f.latitude]);

        // Update the existing popup if it's open
        const popup = marker.getPopup();
        if (popup && popup.isOpen()) {
          popup.setHTML(popupHTML);
        }

        const el = marker.getElement();
        const dot = el.querySelector(".radar-dot") as HTMLElement;
        const label = el.querySelector(".radar-label") as HTMLElement;

        if (dot) {
          dot.style.width = size;
          dot.style.height = size;
          dot.style.background = color;
          el.style.opacity = opacity;
        }
        if (label) {
          label.style.display = labelDisplay;
          label.style.color = color;
          label.innerHTML = `${f.callsign || "UNK"}<br>${altFt.toLocaleString()}FT<br>${kts}KT`;
        }
      } else {
        // Create New Marker with Popup
        const el = document.createElement("div");
        el.className = "radar-blip-container";
        el.style.opacity = opacity;
        el.style.cursor = "pointer"; // Make it clear it's clickable

        el.innerHTML = `
          <div class="radar-dot" style="width:${size}; height:${size}; background:${color}; border-radius:50%; box-shadow: 0 0 10px ${color}66;"></div>
          <div class="radar-label" style="display: ${labelDisplay}; position: absolute; left: 14px; top: -8px; color: ${color}; font-family: monospace; font-size: 10px; text-shadow: 2px 2px 2px black; pointer-events: none; white-space: nowrap;">
            ${f.callsign || "UNK"}<br>${altFt.toLocaleString()}FT<br>${kts}KT
          </div>
        `;

        const newPopup = new maplibregl.Popup({
          offset: 15,
          closeButton: false,
          className: "tactical-popup",
        }).setHTML(popupHTML);

        markers.current[f.icao24] = new maplibregl.Marker({ element: el })
          .setLngLat([f.longitude, f.latitude])
          .setPopup(newPopup) // Re-attach the click listener
          .addTo(map.current!);
      }
    });

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
