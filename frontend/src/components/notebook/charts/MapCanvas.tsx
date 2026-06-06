import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { MapPayload } from "@/types/execution";

export interface MapCanvasProps {
  payload: MapPayload;
}

export interface RecenterProps {
  center: [number, number];
}

function Recenter({ center }: RecenterProps) {
  const map = useMap();
  map.setView(center, map.getZoom(), { animate: true });
  return null;
}

export function MapCanvas({ payload }: MapCanvasProps) {
  if (payload.error) {
    return (
      <section className="bg-panel border border-border rounded-lg m-2 p-12 text-center shadow-card text-textdim">
        {payload.error}
      </section>
    );
  }
  if (!payload.center || payload.points.length === 0) {
    return (
      <section className="bg-panel border border-border rounded-lg m-2 p-12 text-center shadow-card text-textmute">
        No coordinates to plot.
      </section>
    );
  }

  return (
    <section
      className="bg-panel border border-border rounded-lg m-2 shadow-card overflow-hidden"
      style={{ height: 520 }}
    >
      <MapContainer
        center={payload.center}
        zoom={3}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>, &copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
        />
        <Recenter center={payload.center} />
        {payload.points.map(([lat, lon], i) => (
          <CircleMarker
            key={i}
            center={[lat, lon]}
            radius={3}
            pathOptions={{
              color: "#4f46e5",
              fillColor: "#6366f1",
              fillOpacity: 0.7,
              weight: 1,
            }}
          />
        ))}
      </MapContainer>
    </section>
  );
}
