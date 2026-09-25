import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { TRAFFIC_META } from '../lib/traffic';

const pinIcon = (traffic, label) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="width:30px;height:30px;border-radius:999px;background:${traffic ? TRAFFIC_META[traffic].color : '#0d0c22'};border:3px solid #fff;box-shadow:0 4px 12px rgba(13,12,34,.25);display:flex;align-items:center;justify-content:center;font:700 12px 'Mona Sans',Inter,sans-serif;color:#fff">${label ?? ''}</div>`,
  });

function FitBounds({ pins, center }) {
  const map = useMap();
  // Only re-fit when coordinates really change (not on every live update).
  const key = JSON.stringify([pins.map((p) => [p.lat, p.lng]), center ?? null]);
  useEffect(() => {
    const [coords, c] = JSON.parse(key);
    const pts = c ? [...coords, c] : coords;
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 14);
  }, [map, key]);
  return null;
}

function Recenter({ center }) {
  const map = useMap();
  const [lat, lng] = center ?? [];
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [map, lat, lng]);
  return null;
}

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** OpenStreetMap via Leaflet — free, no API key. */
export function MapView({ pins, center, height = 420, onPick, picked }) {
  return (
    <div className="card overflow-hidden" style={{ height }}>
      <MapContainer center={center ?? [18.5204, 73.8567]} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {!onPick && <FitBounds pins={pins} center={center} />}
        {center && !onPick && <Marker position={center} icon={pinIcon(undefined, '★')} />}
        {pins.map((p, i) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.traffic, String(i + 1))}>
            <Popup>
              <b>{p.title}</b>
              {p.subtitle && <div>{p.subtitle}</div>}
              {p.href && <Link to={p.href} className="link-arrow mt-2">View →</Link>}
            </Popup>
          </Marker>
        ))}
        {onPick && <ClickToPick onPick={onPick} />}
        {onPick && <Recenter center={center} />}
        {picked && <Marker position={picked} icon={pinIcon(undefined, '●')} />}
      </MapContainer>
    </div>
  );
}
