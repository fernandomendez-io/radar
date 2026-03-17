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

export default function TacticalMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ [key: string]: maplibregl.Marker }>({});
  const [flights, setFlights] = useState<Flight[]>([]);
  const trails = useRef<{ [key: string]: [number, number][] }>({});

  // 1. Initialize Map
  useEffect(() => {
    const updateRadar = async () => {
      try {
        // 1. Fetching directly from OpenSky (Client-Side)
        const res = await fetch(
          "https://opensky-network.org/api/states/all?lamin=32.5&lomin=-97.5&lamax=33.5&lomax=-96.5",
        );

        if (!res.ok) throw new Error("Signal Lost");
        const rawData = await res.json();

        // 2. Process the raw array into our Flight interface
        const data: Flight[] = (rawData.states || []).map((s: any) => ({
          icao24: s[0],
          callsign: s[1].trim(),
          longitude: s[5],
          latitude: s[6],
          altitude: s[7] || 0,
          on_ground: s[8],
          velocity: s[9] || 0,
          heading: s[10] || 0,
        }));

        setFlights(data);

        if (!map.current || !map.current.isStyleLoaded()) return;

        const currentIcaos = data.map((f: Flight) => f.icao24);

        // --- REMAINDER OF YOUR MARKER & TRAIL LOGIC ---
        data.forEach((f: Flight) => {
          const isCompany =
            f.callsign.startsWith("ENY") || f.callsign.startsWith("AAL");
          const altFt = Math.round(f.altitude * 3.28084);
          const kts = Math.round(f.velocity * 1.944);

          const isLow = f.on_ground || altFt < 600;
          const color = isCompany ? "#60a5fa" : "#10b981";
          const size = isLow ? "3px" : "10px";
          const opacity = isLow ? "0.3" : "1";
          const labelDisplay = isLow && !isCompany ? "none" : "block";

          // Trail recording
          if (!f.on_ground) {
            if (!trails.current[f.icao24]) trails.current[f.icao24] = [];
            trails.current[f.icao24].push([f.longitude, f.latitude]);
            if (trails.current[f.icao24].length > 10)
              trails.current[f.icao24].shift();
          }

          if (markers.current[f.icao24]) {
            const marker = markers.current[f.icao24];
            marker.setLngLat([f.longitude, f.latitude]);
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
            // Create New Marker logic (Same as you had before)
            const el = document.createElement("div");
            el.className = "radar-blip-container";
            el.style.opacity = opacity;
            el.style.zIndex = isLow ? "1" : "100";
            el.innerHTML = `
            <div class="radar-dot" style="width:${size}; height:${size}; background:${color}; border-radius:50%; box-shadow: 0 0 10px ${color}66; transition: all 0.4s ease;"></div>
            <div class="radar-label" style="display: ${labelDisplay}; position: absolute; left: 14px; top: -8px; color: ${color}; font-family: monospace; font-size: 10px; text-shadow: 2px 2px 2px black; pointer-events: none;">
              ${f.callsign || "UNK"}<br>${altFt.toLocaleString()}FT<br>${kts}KT
            </div>
          `;
            const popup = new maplibregl.Popup({
              offset: 15,
              closeButton: false,
              className: "tactical-popup",
            })
              .setHTML(`<div style="background: rgba(0,0,0,0.9); border: 1px solid ${color}; padding: 8px; font-family: monospace; color: ${color}; min-width: 120px;">
                <b style="border-bottom: 1px solid ${color}44; display: block; margin-bottom: 4px;">${f.callsign || "ADS-B UNK"}</b>
                <div style="font-size: 10px;">
                  ALT: <span style="color: #fff;">${altFt.toLocaleString()} FT</span><br>
                  SPD: <span style="color: #fff;">${kts} KTS</span><br>
                  ID: <span style="color: #666;">${f.icao24.toUpperCase()}</span>
                </div>
              </div>`);
            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([f.longitude, f.latitude])
              .setPopup(popup)
              .addTo(map.current!);
            markers.current[f.icao24] = marker;
          }
        });

        // Cleanup
        Object.keys(markers.current).forEach((icao) => {
          if (!currentIcaos.includes(icao)) {
            markers.current[icao].remove();
            delete markers.current[icao];
            delete trails.current[icao];
          }
        });

        // Update Trail source
        const trailFeatures = Object.keys(trails.current)
          .filter((icao) => trails.current[icao].length > 1)
          .map((icao) => ({
            type: "Feature",
            geometry: { type: "LineString", coordinates: trails.current[icao] },
          }));
        const trailSource = map.current.getSource(
          "plane-trails",
        ) as maplibregl.GeoJSONSource;
        if (trailSource) {
          trailSource.setData({
            type: "FeatureCollection",
            features: trailFeatures as any,
          });
        }
      } catch (e) {
        console.error("Radar sweep failed...", e);
      }
    };

    const interval = setInterval(updateRadar, 4000);
    updateRadar();
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="relative w-screen h-screen bg-[#0a0a0a] overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* HUD Overlay */}
      <div className="absolute top-6 left-6 z-10 p-4 border border-emerald-900 bg-black/80 font-mono">
        <h1 className="text-emerald-500 text-lg font-bold italic">RADAR</h1>
        <p className="text-emerald-800 text-[10px]">
          TARGETS IN SECTOR: {flights.length}
        </p>
      </div>

      {/* CRT Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none z-20 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
    </main>
  );
}
