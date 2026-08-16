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

// ── South India + India city coordinate lookup ─────────────────────────────
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

/**
 * Returns [lat, lng] from a city name string, or null if not found.
 *
 * Safety rules:
 *  1. Abbreviations ≤ 2 chars (e.g. "AP", "TN") are NEVER matched via
 *     substring — they are only accepted on exact key match (which won't
 *     exist in CITY_COORDS, so they return null).
 *  2. Partial matching splits the input on spaces/commas and checks whether
 *     any token (≥3 chars) is an exact substring of a city name key, or a
 *     city name key starts with the token — preventing "ap" from matching
 *     "visakhapatnam".
 */
function lookupCity(cityStr) {
  if (!cityStr) return null;
  const raw = String(cityStr).trim();
  const key = raw.toLowerCase();

  // 1. Exact key match
  if (CITY_COORDS[key]) return CITY_COORDS[key];

  // 2. If the whole string is ≤2 chars it's likely a state code — no partial match
  if (key.length <= 2) return null;

  // 3. Check if any city name key is contained in our input string
  //    (e.g. "Kakinada, AP" → contains "kakinada")
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    // Only attempt token matching for city keys ≥ 3 chars
    if (name.length < 3) continue;
    if (key === name) return coords;
    // Check word-boundary: city name appears as a whole word in the input
    // Use regex to avoid "ap" matching inside "kakinada"
    const re = new RegExp(`(?:^|[\\s,])${name.replace(/[-]/g, '\\-')}(?:$|[\\s,])`);
    if (re.test(key)) return coords;
  }

  // 4. Tokenise input by spaces/commas and check if any token (≥3 chars)
  //    exactly equals a city name key
  const tokens = key.split(/[\s,]+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    if (CITY_COORDS[token]) return CITY_COORDS[token];
    // Also check if a city name starts with this token (e.g. "hyd" → "hyderabad")
    for (const [name, coords] of Object.entries(CITY_COORDS)) {
      if (name.length >= 3 && name.startsWith(token) && token.length >= 4) return coords;
    }
  }

  return null;
}

function makeIcon(color, emoji) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px ${color};font-size:15px;border:2px solid #fff;">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/** Convert raw minutes → "Xh Ym" display */
function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "—";
  const totalMins = Math.round(Number(minutes));
  if (isNaN(totalMins)) return "—";
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
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
  // ✅ All hooks at the top — unconditionally
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ start: null, end: null, vehicle: null, polyline: null });

  // Determine the effective shipment info — prefer direct props, then trip's linked shipment, else trackedShipment prop
  const shipmentInfo = trip?.shipment || trackedShipment || null;
  const effectiveSource = propStartLabel || shipmentInfo?.source || "";
  const effectiveDestination = propEndLabel || shipmentInfo?.destination || "";
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

    const hasDirectCoords = Array.isArray(propStartCoords) && propStartCoords.length === 2 &&
                            Array.isArray(propEndCoords) && propEndCoords.length === 2;

    // No trip selected, no tracked shipment, and no direct coordinates → reset to default world view
    if (!trip && !trackedShipment && !hasDirectCoords) {
      map.setView([20.5937, 78.9629], 5, { animate: true });
      return;
    }

    // Resolve start/end coordinates:
    // Priority: 1) direct propStartCoords / propEndCoords if provided
    //           2) trip.start_lat/end_lat if non-zero
    //           3) shipment city name lookup (source/destination)
    //           4) Show error — do NOT fall back to random coordinates
    const srcCityCoords = lookupCity(effectiveSource);
    const dstCityCoords = lookupCity(effectiveDestination);

    const hasTripCoords = trip && Number(trip.start_lat) && Number(trip.start_lng);
    const hasSourceCoords = hasDirectCoords || hasTripCoords || srcCityCoords;
    const hasDestCoords = hasDirectCoords || (trip && Number(trip.end_lat)) || dstCityCoords;

    // If source cannot be resolved, show error and reset map — DO NOT guess
    if (!hasSourceCoords) {
      map.setView([20.5937, 78.9629], 5, { animate: true });
      if (mapContainerRef.current) {
        mapContainerRef.current.setAttribute("data-src-error", "true");
        mapContainerRef.current.setAttribute(
          "data-src-name",
          effectiveSource || "(empty)"
        );
      }
      return;
    }
    // Clear any previous error state
    if (mapContainerRef.current) {
      mapContainerRef.current.removeAttribute("data-src-error");
      mapContainerRef.current.removeAttribute("data-src-name");
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

    // Parse stored GeoJSON route polyline or fall back to straight line
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
            // Check if coordinates are [lng, lat] or [lat, lng]
            polyCoords = parsed.map((pt) => [Number(pt[1]) || 0, Number(pt[0]) || 0]);
          }
        }
      }
    } catch (_) {}

    const color = ROUTE_COLORS[selectedRouteType || trip?.route_type] || "#06b6d4";

    // Use actual shipment city names for popup labels
    const startLabel = effectiveSource || `${sLat.toFixed(4)}, ${sLng.toFixed(4)}`;
    const endLabel   = effectiveDestination || `${eLat.toFixed(4)}, ${eLng.toFixed(4)}`;

    m.start    = L.marker(startCoords, { icon: makeIcon("#22c55e", "🟢") }).bindPopup(`📍 ${startLabel}`).addTo(map);
    m.end      = L.marker(endCoords,   { icon: makeIcon("#ef4444", "🔴") }).bindPopup(`🏁 ${endLabel}`).addTo(map);
    m.polyline = L.polyline(polyCoords, { color, weight: 5, opacity: 0.85 }).addTo(map);

    if (trip) {
      m.vehicle = L.marker(currentPos, { icon: makeIcon("#06b6d4", "🚚") })
        .bindPopup(`<b>🚚 Vehicle</b><br/>Speed: ${livePosition?.speed ?? 0} km/h`)
        .addTo(map);
    }

    try {
      const bounds = L.latLngBounds([startCoords, endCoords, ...(trip ? [currentPos] : [])]);
      map.fitBounds(bounds, { padding: [50, 50], animate: true, maxZoom: 14 });
    } catch (_) {
      map.setView(startCoords, 10);
    }

    // Always call invalidateSize after placing markers
    setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 100);
  }, [trip, trackedShipment, livePosition, selectedRouteType, effectiveSource, effectiveDestination]);

  // ── Derived display values ─────────────────────────────────────────────────
  const displayLat = livePosition?.lat != null ? Number(livePosition.lat) : Number(trip?.start_lat ?? 0);
  const displayLng = livePosition?.lng != null ? Number(livePosition.lng) : Number(trip?.start_lng ?? 0);

  const hasDirectCoords =
    Array.isArray(propStartCoords) &&
    propStartCoords.length === 2 &&
    Array.isArray(propEndCoords) &&
    propEndCoords.length === 2;

  // Compute whether the source city is resolvable (for error overlay)
  const srcCoordsAvailable =
    hasDirectCoords ||
    (trip && Number(trip.start_lat)) ||
    lookupCity(effectiveSource) !== null;
  const showSourceError = (trip || trackedShipment) && !hasDirectCoords && !srcCoordsAvailable && !!effectiveSource;
  const showSourceMissing = (trip || trackedShipment) && !hasDirectCoords && !srcCoordsAvailable && !effectiveSource;

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
                    <p>⏱️ {formatDuration(opt.duration)}</p>
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

        {/* No-trip overlay — only shown when neither a trip nor a tracked shipment is selected */}
        {!trip && !trackedShipment && (
          <div style={{ position: "absolute", inset: 0, zIndex: 500, borderRadius: "12px" }}
            className="bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3"
          >
            <span className="text-4xl">🗺️</span>
            <p className="text-slate-400 text-sm font-medium">Select a trip to view live tracking</p>
            <p className="text-slate-600 text-xs">Schedule a new trip or click one from the list</p>
          </div>
        )}

        {/* Source-location incomplete overlay */}
        {(showSourceError || showSourceMissing) && (
          <div style={{ position: "absolute", inset: 0, zIndex: 500, borderRadius: "12px" }}
            className="bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <span className="text-4xl">⚠️</span>
            <p className="text-amber-400 text-sm font-semibold">
              {showSourceMissing
                ? "Source location is missing."
                : `"${effectiveSource}" is not a specific city.`}
            </p>
            <p className="text-slate-400 text-xs max-w-xs">
              {showSourceMissing
                ? "Please set a specific source city on this shipment before tracking."
                : `"${effectiveSource}" appears to be a state code, not a city name. Please update the shipment with a specific source city (e.g. Kakinada, Vijayawada, Visakhapatnam).`}
            </p>
          </div>
        )}

        {/* Live HUD overlay — shown when a trip is selected */}
        {trip && (
          <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 1000, minWidth: "185px" }}
            className="bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-xl text-xs space-y-1"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white">Live GPS HUD</span>
            </div>
            <div className="text-slate-300 space-y-0.5">
              {(effectiveSource || effectiveDestination) && (
                <p className="text-cyan-400 font-semibold text-[10px] truncate">{effectiveSource} → {effectiveDestination}</p>
              )}
              <p><span className="text-slate-400">Lat: </span>{displayLat.toFixed(4)}</p>
              <p><span className="text-slate-400">Lng: </span>{displayLng.toFixed(4)}</p>
              <p><span className="text-slate-400">Speed: </span>{livePosition?.speed ?? 0} km/h</p>
              <p><span className="text-slate-400">Dist: </span>{trip.distance ? `${trip.distance} km` : "—"}</p>
              <p><span className="text-slate-400">Duration: </span>{formatDuration(trip.duration)}</p>
              <p><span className="text-slate-400">ETA: </span>{trip.eta ? new Date(trip.eta).toLocaleTimeString() : "N/A"}</p>
            </div>
          </div>
        )}

        {/* Shipment info overlay — shown when tracking a shipment that has no trip yet */}
        {!trip && trackedShipment && (
          <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 1000, minWidth: "185px" }}
            className="bg-slate-950/90 backdrop-blur-md border border-amber-800/60 rounded-xl p-3 shadow-xl text-xs space-y-1"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-400">📦</span>
              <span className="font-semibold text-white">Shipment Route</span>
            </div>
            <div className="text-slate-300 space-y-0.5">
              <p className="text-cyan-400 font-semibold text-[10px]">{effectiveSource} → {effectiveDestination}</p>
              <p><span className="text-slate-400">Status: </span><span className="text-amber-300">{trackedShipment.status}</span></p>
              <p className="text-amber-400/80 text-[10px] pt-1">No trip assigned yet</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
