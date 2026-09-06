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
  fastest: "#2563eb",
  shortest: "#0284c7",
  traffic_avoidance: "#7c3aed",
  fuel_efficient: "#059669",
};

// South India + Major India city coordinate lookup
const CITY_COORDS = {
  vijayawada:     [16.5062, 80.6480],
  kakinada:       [16.9891, 82.2475],
  visakhapatnam:  [17.6868, 83.2185],
  vizag:          [17.6868, 83.2185],
  guntur:         [16.3067, 80.4365],
  rajahmundry:    [17.0005, 81.8040],
  tirupati:       [13.6288, 79.4192],
  srikakulam:     [18.3000, 83.9000],
  nellore:        [14.4426, 79.9865],
  kurnool:        [15.8281, 78.0373],
  ongole:         [15.5057, 80.0499],
  eluru:          [16.7107, 81.1035],
  kadapa:         [14.4673, 78.8242],
  anantapur:      [14.6819, 77.6006],
  warangal:       [17.9689, 79.5941],
  hyderabad:      [17.3850, 78.4867],
  secunderabad:   [17.4399, 78.4983],
  kollam:         [8.8932,  76.6141],
  chennai:        [13.0827, 80.2707],
  bangalore:      [12.9716, 77.5946],
  bengaluru:      [12.9716, 77.5946],
  mumbai:         [19.0760, 72.8777],
  pune:           [18.5204, 73.8567],
  kolkata:        [22.5726, 88.3639],
  ahmedabad:      [23.0225, 72.5714],
  nagpur:         [21.1458, 79.0882],
  surat:          [21.1702, 72.8311],
  jaipur:         [26.9124, 75.7873],
  lucknow:        [26.8467, 80.9462],
  delhi:          [28.6139, 77.2090],
  "new delhi":    [28.6139, 77.2090],
};

function lookupCity(cityStr) {
  if (!cityStr) return null;
  const raw = String(cityStr).trim();
  const key = raw.toLowerCase();

  if (CITY_COORDS[key]) return CITY_COORDS[key];
  if (key.length <= 2) return null;

  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (name.length < 3) continue;
    if (key === name) return coords;
    const re = new RegExp(`(?:^|[\\s,])${name.replace(/[-]/g, '\\-')}(?:$|[\\s,])`);
    if (re.test(key)) return coords;
  }

  const tokens = key.split(/[\s,]+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    if (CITY_COORDS[token]) return CITY_COORDS[token];
    for (const [name, coords] of Object.entries(CITY_COORDS)) {
      if (name.length >= 3 && name.startsWith(token) && token.length >= 4) return coords;
    }
  }

  return null;
}

function makeIcon(color, emoji) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:16px;border:2px solid #fff;">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "—";
  const totalMins = Math.round(Number(minutes));
  if (isNaN(totalMins)) return "—";
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}

function formatETA(durationMinutes, rawEta = null) {
  if (rawEta) {
    try {
      const d = new Date(rawEta);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
    } catch (_) {}
  }
  if (!durationMinutes && durationMinutes !== 0) return "Calculated on start";
  const now = new Date();
  const etaDate = new Date(now.getTime() + Number(durationMinutes) * 60000);
  return etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TrackingMap({
  trip,
  trackedShipment,
  livePosition,
  routeOptions,
  selectedRouteType,
  onSelectRouteType,
  startCoords: propStartCoords,
  endCoords: propEndCoords,
  startLabel: propStartLabel,
  endLabel: propEndLabel,
  customPolyline,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ start: null, end: null, vehicle: null, polyline: null });

  const shipmentInfo = trip?.shipment || trackedShipment || null;
  const effectiveSource = propStartLabel || shipmentInfo?.source || trip?.origin || "";
  const effectiveDestination = propEndLabel || shipmentInfo?.destination || trip?.destination || "";

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [16.5062, 80.6480],
      zoom: 6,
      preferCanvas: true,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ animate: false });
    });
    observer.observe(mapContainerRef.current);

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
  }, []);

  // Update markers & route polyline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const m = markersRef.current;
    const safe = (layer) => { try { map.removeLayer(layer); } catch (_) {} };
    if (m.start)    { safe(m.start);    m.start    = null; }
    if (m.end)      { safe(m.end);      m.end      = null; }
    if (m.vehicle)  { safe(m.vehicle);  m.vehicle  = null; }
    if (m.polyline) { safe(m.polyline); m.polyline = null; }

    const hasDirectCoords = Array.isArray(propStartCoords) && propStartCoords.length === 2 &&
                            Array.isArray(propEndCoords) && propEndCoords.length === 2;

    if (!trip && !trackedShipment && !hasDirectCoords) {
      map.setView([16.5062, 80.6480], 6, { animate: true });
      return;
    }

    const srcCityCoords = lookupCity(effectiveSource);
    const dstCityCoords = lookupCity(effectiveDestination);

    const hasTripCoords = trip && Number(trip.start_lat) && Number(trip.start_lng);
    const hasSourceCoords = hasDirectCoords || hasTripCoords || srcCityCoords;
    const hasDestCoords = hasDirectCoords || (trip && Number(trip.end_lat)) || dstCityCoords;

    if (!hasSourceCoords) {
      map.setView([16.5062, 80.6480], 6, { animate: true });
      return;
    }

    let sLat, sLng, eLat, eLng;
    if (hasDirectCoords) {
      sLat = Number(propStartCoords[0]);
      sLng = Number(propStartCoords[1]);
      eLat = Number(propEndCoords[0]);
      eLng = Number(propEndCoords[1]);
    } else {
      sLat = hasTripCoords ? Number(trip.start_lat) : srcCityCoords[0];
      sLng = hasTripCoords ? Number(trip.start_lng) : srcCityCoords[1];
      eLat = (trip && Number(trip.end_lat)) ? Number(trip.end_lat) : (hasDestCoords ? dstCityCoords[0] : sLat + 0.5);
      eLng = (trip && Number(trip.end_lng)) ? Number(trip.end_lng) : (hasDestCoords ? dstCityCoords[1] : sLng + 0.5);
    }

    const startCoords = [sLat, sLng];
    const endCoords   = [eLat, eLng];
    const lLat = livePosition?.lat != null ? Number(livePosition.lat) : sLat;
    const lLng = livePosition?.lng != null ? Number(livePosition.lng) : sLng;
    const currentPos  = [lLat, lLng];

    // Build route polyline
    let polyCoords = [startCoords, endCoords];
    try {
      if (customPolyline && Array.isArray(customPolyline) && customPolyline.length > 0) {
        polyCoords = customPolyline;
      } else {
        const activeOpt = routeOptions && (routeOptions[selectedRouteType] || Object.values(routeOptions)[0]);
        const pathData = activeOpt?.route_path || trip?.route_path;
        if (pathData) {
          const parsed = typeof pathData === "string" ? JSON.parse(pathData) : pathData;
          if (Array.isArray(parsed) && parsed.length > 0) {
            polyCoords = parsed.map((pt) => {
              const c0 = Number(pt[0]) || 0;
              const c1 = Number(pt[1]) || 0;
              if (c0 > 45 && c1 < 45) {
                return [c1, c0];
              }
              return [c0, c1];
            });
          }
        }
      }
    } catch (_) {}

    const color = ROUTE_COLORS[selectedRouteType || trip?.route_type] || "#2563eb";

    const startLabel = effectiveSource || `${sLat.toFixed(4)}, ${sLng.toFixed(4)}`;
    const endLabel   = effectiveDestination || `${eLat.toFixed(4)}, ${eLng.toFixed(4)}`;

    m.start    = L.marker(startCoords, { icon: makeIcon("#10b981", "🟢") }).bindPopup(`<b>Origin:</b> ${startLabel}`).addTo(map);
    m.end      = L.marker(endCoords,   { icon: makeIcon("#ef4444", "🏁") }).bindPopup(`<b>Destination:</b> ${endLabel}`).addTo(map);
    m.polyline = L.polyline(polyCoords, { color, weight: 5, opacity: 0.85 }).addTo(map);

    if (trip) {
      m.vehicle = L.marker(currentPos, { icon: makeIcon("#2563eb", "🚚") })
        .bindPopup(`<b>🚚 Vehicle Tracker</b><br/>Speed: ${livePosition?.speed ?? 0} km/h<br/>ETA: ${formatETA(trip.duration, trip.eta)}`)
        .addTo(map);
    }

    try {
      const bounds = L.latLngBounds([startCoords, endCoords, ...(trip ? [currentPos] : [])]);
      map.fitBounds(bounds, { padding: [50, 50], animate: true, maxZoom: 14 });
    } catch (_) {
      map.setView(startCoords, 8);
    }

    setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 100);
  }, [trip, trackedShipment, livePosition, selectedRouteType, effectiveSource, effectiveDestination]);

  const displayLat = livePosition?.lat != null ? Number(livePosition.lat) : Number(trip?.start_lat ?? 0);
  const displayLng = livePosition?.lng != null ? Number(livePosition.lng) : Number(trip?.start_lng ?? 0);

  return (
    <div className="space-y-4">
      {/* Route Strategy Options Bar */}
      {routeOptions && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-bold font-mono tracking-wider text-slate-800 uppercase flex items-center gap-1.5">
              <span>🗺️</span>
              <span>Select Route Optimization Strategy</span>
            </h4>
            <span className="text-[11px] font-mono text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              TRAFFIC-AWARE INTELLIGENCE
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(routeOptions).map(([type, opt]) => {
              const isSelected = (selectedRouteType || trip?.route_type) === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelectRouteType && onSelectRouteType(type)}
                  className={`p-3 rounded-xl border text-left transition ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/70 text-blue-900 shadow-sm ring-1 ring-blue-600"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-bold text-xs text-slate-900 uppercase">{opt.name}</p>
                    {isSelected && <span className="text-blue-600 text-[10px] font-bold">✔ ACTIVE</span>}
                  </div>
                  <div className="text-[11px] space-y-0.5 font-mono">
                    <p>📏 Distance: <strong className="text-slate-900">{opt.distance} km</strong></p>
                    <p>⏱️ Duration: <strong className="text-slate-900">{formatDuration(opt.duration)}</strong></p>
                    <p>🕒 Est. ETA: <strong className="text-blue-600">{formatETA(opt.duration)}</strong></p>
                    {opt.traffic_delay_mins > 0 ? (
                      <p className="text-amber-600 text-[10px] font-bold">⚠️ +{opt.traffic_delay_mins}m simulated delay</p>
                    ) : (
                      <p className="text-emerald-600 text-[10px] font-bold">✓ Clear conditions</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Map Container Area */}
      <div style={{ position: "relative", height: "440px", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)" }}>
        <div
          ref={mapContainerRef}
          style={{ height: "440px", width: "100%" }}
        />

        {/* No-trip selected placeholder overlay */}
        {!trip && !trackedShipment && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10 }}
            className="bg-white/90 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-6 text-center"
          >
            <span className="text-4xl">🗺️</span>
            <p className="text-slate-800 font-bold text-sm">Select a trip to view live route tracking</p>
            <p className="text-slate-500 text-xs">Schedule a new trip or click an existing trip from the right panel.</p>
          </div>
        )}

        {/* Live HUD overlay */}
        {trip && (
          <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 20, minWidth: "210px" }}
            className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3.5 shadow-lg text-xs space-y-1.5 font-sans"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-slate-900">Live GPS HUD</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-blue-600 uppercase">
                {trip.status}
              </span>
            </div>

            <div className="text-slate-600 space-y-0.5 text-[11px] font-mono">
              {(effectiveSource || effectiveDestination) && (
                <p className="text-blue-600 font-bold font-sans text-xs truncate">
                  {effectiveSource} → {effectiveDestination}
                </p>
              )}
              <p><span className="text-slate-400">Position: </span>{displayLat.toFixed(4)}, {displayLng.toFixed(4)}</p>
              <p><span className="text-slate-400">Speed: </span><strong className="text-slate-900">{livePosition?.speed ?? 0} km/h</strong></p>
              <p><span className="text-slate-400">Distance: </span><strong className="text-slate-900">{trip.distance ? `${trip.distance} km` : "—"}</strong></p>
              <p><span className="text-slate-400">Duration: </span><strong className="text-slate-900">{formatDuration(trip.duration)}</strong></p>
              <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 font-semibold">🕒 Est. ETA:</span>
                <span className="font-bold text-blue-600 text-xs">{formatETA(trip.duration, trip.eta)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
