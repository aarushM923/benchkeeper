"use client";

// Leaflet touches `window` when imported, so it's loaded inside an effect,
// after hydration. Tiles are OpenStreetMap's (no API key; attribution required).

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { BenchPin } from "@/lib/benches";

const COLORS: Record<BenchPin["kind"], string> = {
  AVAILABLE: "#15803d", // green-700
  ADOPTED: "#d97706", // amber-600
  RESERVED: "#0284c7", // sky-600
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function BenchMap({ pins }: { pins: BenchPin[] }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const markers = pins.map((p) =>
        L.circleMarker([p.lat, p.lng], {
          radius: 6,
          color: "#fff",
          weight: 1,
          fillColor: COLORS[p.kind],
          fillOpacity: 0.9,
        })
          // Names come from visitors: escape before handing Leaflet HTML.
          .bindPopup(
            `<strong>${escapeHtml(p.code)}</strong> · ${escapeHtml(p.zone)}<br>` +
              `${escapeHtml(p.summary)}<br><a href="/benches/${encodeURIComponent(p.code)}">View bench →</a>`,
          )
          .addTo(map!),
      );
      if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.05));
      else map.setView([40.897, -73.889], 15);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins]);

  return <div ref={el} className="h-[70vh] min-h-96 w-full rounded-lg border border-stone-200" />;
}
