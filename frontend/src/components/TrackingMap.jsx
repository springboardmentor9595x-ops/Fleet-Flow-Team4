import { useEffect, useRef } from "react";
import L from "leaflet";

// Fix default Leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const ROUTE_COLORS = {
  fastest: "#06b6d4",
  shortest: "#3b82f6",
  traffic_avoidance: "#a855f7",
  fuel_efficient: "#22c55e",
};

function makeIcon(color, emoji) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px ${color};font-size:15px;border:2px solid #fff;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function TrackingMap({ trip, livePosition, routeOptions, selectedRouteType, onSelectRouteType }) {
  // ✅ All hooks at the top — unconditionally
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ start: null, end: null, vehicle: null, polyline: null });

  // ── Initialize Leaflet map ONCE on mount ───────────────────────────────────
  // KEY RULE: mapContainerRef div must ALWAYS be in the DOM when this fires.
  // We achieve this by rendering the div unconditionally and using a CSS
  // overlay for the "no trip selected" placeholder instead of conditional JSX.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
      preferCanvas: true,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // ResizeObserver fires the moment the browser gives the container real px dimensions
    // — works on first mount AND when navigating back from another page
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    observer.observe(mapContainerRef.current);

    // Fallback timeouts for slower browsers
    const t1 = setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 150);
    const t2 = setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      observer.disconnect();
      markersRef.current = { start: null, end: null, vehicle: null, polyline: null };
      map.remove();
      mapRef.current = null;
    };
  }, []); // runs only on component mount / unmount

  // ── Update markers + polyline when trip or live data changes ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const m = markersRef.current;
    const safe = (layer) => { try { map.removeLayer(layer); } catch (_) {} };
    if (m.start)    { safe(m.start);    m.start    = null; }
    if (m.end)      { safe(m.end);      m.end      = null; }
    if (m.vehicle)  { safe(m.vehicle);  m.vehicle  = null; }
    if (m.polyline) { safe(m.polyline); m.polyline = null; }

    // No trip selected → reset to default world view
    if (!trip) {
      map.setView([20.5937, 78.9629], 5, { animate: true });
      return;
    }

    const sLat = Number(trip.start_lat) || 28.6139;
    const sLng = Number(trip.start_lng) || 77.2090;
    const eLat = Number(trip.end_lat)   || 28.7041;
    const eLng = Number(trip.end_lng)   || 77.1025;
    const startCoords = [sLat, sLng];
    const endCoords   = [eLat, eLng];
    const lLat = livePosition?.lat != null ? Number(livePosition.lat) : sLat;
    const lLng = livePosition?.lng != null ? Number(livePosition.lng) : sLng;
    const currentPos  = [lLat, lLng];

    // Parse stored GeoJSON route polyline or fall back to straight line
    let polyCoords = [startCoords, endCoords];
    try {
      if (trip.route_path) {
        const parsed = JSON.parse(trip.route_path);
        if (Array.isArray(parsed) && parsed.length > 0) {
          polyCoords = parsed.map((pt) => [Number(pt[1]) || 0, Number(pt[0]) || 0]);
        }
      }
    } catch (_) {}

    const color = ROUTE_COLORS[selectedRouteType || trip.route_type] || "#06b6d4";

    m.start    = L.marker(startCoords, { icon: makeIcon("#22c55e", "🟢") }).bindPopup("📍 Start Location").addTo(map);
    m.end      = L.marker(endCoords,   { icon: makeIcon("#ef4444", "🔴") }).bindPopup("🏁 Destination").addTo(map);
    m.polyline = L.polyline(polyCoords, { color, weight: 5, opacity: 0.85 }).addTo(map);
    m.vehicle  = L.marker(currentPos,  { icon: makeIcon("#06b6d4", "🚚") })
      .bindPopup(`<b>🚚 Vehicle</b><br/>Speed: ${livePosition?.speed ?? 0} km/h`)
      .addTo(map);

    try {
      const bounds = L.latLngBounds([startCoords, endCoords, currentPos]);
      map.fitBounds(bounds, { padding: [50, 50], animate: true, maxZoom: 14 });
    } catch (_) {
      map.setView(currentPos, 12);
    }

    // Always call invalidateSize after placing markers in case the container
    // was 0×0 when this effect fired (e.g. right after a new trip is created)
    setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 100);
  }, [trip, livePosition, selectedRouteType]);

  // ── Derived display values ─────────────────────────────────────────────────
  const displayLat = livePosition?.lat != null ? Number(livePosition.lat) : Number(trip?.start_lat ?? 0);
  const displayLng = livePosition?.lng != null ? Number(livePosition.lng) : Number(trip?.start_lng ?? 0);

  return (
    <div className="space-y-4">
      {/* Route Options Selector */}
      {routeOptions && trip && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-cyan-400">🗺️ Route Strategy Options</h4>
            <span className="text-xs text-slate-400">Traffic-Aware Optimization</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(routeOptions).map(([type, opt]) => {
              const isSelected = (selectedRouteType || trip.route_type) === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelectRouteType && onSelectRouteType(type)}
                  className={`p-3 rounded-lg border text-left transition ${
                    isSelected
                      ? "border-cyan-500 bg-cyan-950/40 text-cyan-200 shadow-md shadow-cyan-500/10"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <p className="font-semibold text-xs text-white mb-1">{opt.name}</p>
                  <div className="text-[11px] space-y-0.5 text-slate-300">
                    <p>📏 {opt.distance} km</p>
                    <p>⏱️ {opt.duration} min</p>
                    {opt.traffic_delay_mins > 0
                      ? <p className="text-amber-400">⚠️ +{opt.traffic_delay_mins}m delay</p>
                      : <p className="text-emerald-400">✅ Clear</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Map Area ────────────────────────────────────────────────────── */}
      {/*
        IMPORTANT: The map container div is ALWAYS rendered (never conditionally
        removed). This ensures mapContainerRef.current is always valid when the
        useEffect init runs. The "no trip" state is shown as an overlay instead.
      */}
      <div style={{ position: "relative", height: "420px", borderRadius: "12px", border: "1px solid #1e293b", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8)" }}>

        {/* Leaflet always mounts here — no overflow:hidden to avoid clipping tiles */}
        <div
          ref={mapContainerRef}
          style={{ height: "420px", width: "100%", borderRadius: "12px" }}
        />

        {/* No-trip overlay — sits on top of the map using absolute positioning */}
        {!trip && (
          <div style={{ position: "absolute", inset: 0, zIndex: 500, borderRadius: "12px" }}
            className="bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3"
          >
            <span className="text-4xl">🗺️</span>
            <p className="text-slate-400 text-sm font-medium">Select a trip to view live tracking</p>
            <p className="text-slate-600 text-xs">Schedule a new trip or click one from the list</p>
          </div>
        )}

        {/* Live HUD overlay — only shown when a trip is selected */}
        {trip && (
          <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 1000, minWidth: "175px" }}
            className="bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-xl text-xs space-y-1"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white">Live GPS HUD</span>
            </div>
            <div className="text-slate-300 space-y-0.5">
              <p><span className="text-slate-400">Lat: </span>{displayLat.toFixed(4)}</p>
              <p><span className="text-slate-400">Lng: </span>{displayLng.toFixed(4)}</p>
              <p><span className="text-slate-400">Speed: </span>{livePosition?.speed ?? 0} km/h</p>
              <p><span className="text-slate-400">Dist: </span>{trip.distance ? `${trip.distance} km` : "—"}</p>
              <p><span className="text-slate-400">ETA: </span>{trip.eta ? new Date(trip.eta).toLocaleTimeString() : "N/A"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
