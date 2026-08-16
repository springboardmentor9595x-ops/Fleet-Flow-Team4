import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import {
  getTrips,
  createTrip,
  startTrip,
  completeTrip,
  deleteTrip,
  fetchRouteOptions,
  recalculateTripRoute,
} from "../api/trips";
import { getVehicles } from "../api/vehicles";
import { getShipments } from "../api/shipments";
import { getDrivers } from "../api/drivers";
import TrackingMap from "../components/TrackingMap";

const emptyForm = {
  vehicle_id: "",
  driver_id: "",
  shipment_id: "",
  start_lat: "",
  start_lng: "",
  end_lat: "",
  end_lng: "",
  route_type: "fastest",
};

// Known city coordinate lookup
const CITY_COORDS = {
  kakinada:       { name: "Kakinada",       lat: 16.9891, lng: 82.2475 },
  vijayawada:     { name: "Vijayawada",     lat: 16.5062, lng: 80.6480 },
  visakhapatnam:  { name: "Visakhapatnam",  lat: 17.6868, lng: 83.2185 },
  rajahmundry:    { name: "Rajahmundry",    lat: 17.0005, lng: 81.8040 },
  guntur:         { name: "Guntur",         lat: 16.3067, lng: 80.4365 },
  tirupati:       { name: "Tirupati",       lat: 13.6288, lng: 79.4192 },
  hyderabad:      { name: "Hyderabad",      lat: 17.3850, lng: 78.4867 },
  chennai:        { name: "Chennai",        lat: 13.0827, lng: 80.2707 },
  bangalore:      { name: "Bangalore",      lat: 12.9716, lng: 77.5946 },
  mumbai:         { name: "Mumbai",         lat: 19.0760, lng: 72.8777 },
  newdelhi:       { name: "New Delhi",      lat: 28.6139, lng: 77.2090 },
  kolkata:        { name: "Kolkata",        lat: 22.5726, lng: 88.3639 },
};

const QUICK_CITIES = Object.values(CITY_COORDS);

async function geocodeCity(query) {
  if (!query || query.length < 2) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    return data.map((item) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
  } catch (_) {
    return [];
  }
}

const STATUS_COLORS = {
  Scheduled: "bg-slate-500/20 text-slate-300 border-slate-700",
  Active: "bg-blue-500/20 text-blue-400 border-blue-800 animate-pulse",
  Completed: "bg-emerald-500/20 text-emerald-400 border-emerald-800",
  Cancelled: "bg-rose-500/20 text-rose-400 border-rose-800",
};

export default function Trips() {
  const location = useLocation();
  const trackedShipmentId = location.state?.shipmentId;

  const { user } = useAuth();
  const isDriver = user?.role === "Driver";
  const canManage =
    user?.role === "Admin" ||
    user?.role === "FleetManager" ||
    user?.role === "Dispatcher";

  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [shipments, setShipments] = useState([]);        // 'Created' only — for dropdown
  const [allShipments, setAllShipments] = useState([]);  // ALL — for tracking lookup
  const [drivers, setDrivers] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [trackedShipment, setTrackedShipment] = useState(null); // the specific shipment being tracked
  const [livePositions, setLivePositions] = useState({});
  const [routeOptions, setRouteOptions] = useState(null);
  const [selectedRouteType, setSelectedRouteType] = useState("fastest");
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [rerouteNotice, setRerouteNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // City search state
  const [startQuery, setStartQuery] = useState("");
  const [endQuery, setEndQuery]     = useState("");
  const [startResults, setStartResults] = useState([]);
  const [endResults, setEndResults]     = useState([]);
  const [startLabel, setStartLabel] = useState("");
  const [endLabel, setEndLabel]     = useState("");
  const searchTimerRef = useRef(null);

  const socketRef = useRef(null);

  const loadTrips = async (allShipmentsData = null) => {
    try {
      const res = await getTrips();
      const rawTripList = res.data || [];
      const shipmentsSource = allShipmentsData || allShipments || [];

      const enrich = (t) => {
        if (!t) return null;
        const linkedShip = t.shipment || shipmentsSource.find((s) => String(s.shipment_id) === String(t.shipment_id));
        return linkedShip ? { ...t, shipment: linkedShip } : t;
      };

      const tripList = rawTripList.map(enrich);
      setTrips(tripList);

      if (trackedShipmentId) {
        // Find the trip that belongs to THIS specific shipment
        const found = tripList.find((t) => String(t.shipment_id) === String(trackedShipmentId));
        if (found) {
          setSelectedTrip(found);
        } else {
          setSelectedTrip(null);
        }
        // Set the tracked shipment for coordinate lookup
        const ship = shipmentsSource.find((s) => String(s.shipment_id) === String(trackedShipmentId));
        if (ship) setTrackedShipment(ship);
      } else if (tripList.length > 0) {
        setSelectedTrip((prev) => (prev ? enrich(prev) : tripList[0]));
      }
    } catch (err) {
      setError("Failed to load trips");
    }
  };

  const loadDropdownData = async () => {
    try {
      const [vehRes, shipRes, drvRes] = await Promise.all([
        getVehicles().catch(() => ({ data: [] })),
        getShipments().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
      ]);
      setVehicles(vehRes.data || []);
      // For dropdowns we only want 'Created' shipments
      // but store ALL shipments so we can look up source/destination for any tracked shipment
      const allShips = shipRes.data || [];
      setShipments(allShips.filter((s) => s.status === "Created"));
      setAllShipments(allShips);
      setDrivers(drvRes.data || []);
      return allShips; // return so loadTrips can use it immediately
    } catch (err) {
      return [];
    }
  };

  // WebSocket Live GPS Telemetry Subscriber
  useEffect(() => {
    // Load shipments first so coordinate lookup works immediately for track navigation
    const init = async () => {
      const allShips = await loadDropdownData();
      await loadTrips(allShips);
    };
    init();

    const wsUrl = `ws://${window.location.hostname}:8000/ws/tracking`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "TELEMETRY_UPDATE" || data.type === "INITIAL_STATE") {
          const mapObj = {};
          if (Array.isArray(data.trips)) {
            data.trips.forEach((t) => {
              if (t && t.trip_id) {
                mapObj[t.trip_id] = t;
              }
            });
          }
          setLivePositions(mapObj);
        }
      } catch (e) {
        // ignore parse error
      }
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleCalculateRoute = async (customForm = null) => {
    const targetForm = customForm || form;
    if (!targetForm.start_lat || !targetForm.start_lng || !targetForm.end_lat || !targetForm.end_lng) {
      setError("Please select both Start Location and Destination before calculating route.");
      return;
    }
    setError("");
    setCalculatingRoute(true);
    try {
      const res = await fetchRouteOptions({
        start_lat: Number(targetForm.start_lat),
        start_lng: Number(targetForm.start_lng),
        end_lat: Number(targetForm.end_lat),
        end_lng: Number(targetForm.end_lng),
      });
      setRouteOptions(res.data);
    } catch (err) {
      setError("Failed to calculate route optimization");
    } finally {
      setCalculatingRoute(false);
    }
  };

  const openAddForm = () => {
    setForm(emptyForm);
    setSelectedRouteType("fastest");
    setShowForm(true);
    setError("");
    setStartQuery(""); setEndQuery("");
    setStartResults([]); setEndResults([]);
    setStartLabel(""); setEndLabel("");
    setRouteOptions(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const updated = { ...prev, [name]: value };

      // Auto pre-fill cities if selecting shipment
      if (name === "shipment_id") {
        const selectedShip = shipments.find((s) => s.shipment_id === value);
        if (selectedShip) {
          if (selectedShip.vehicle_id) {
            updated.vehicle_id = selectedShip.vehicle_id;
          }
          if (selectedShip.driver_id) {
            updated.driver_id = selectedShip.driver_id;
          }

          // Use safe lookup: exact key match only (≤2-char strings like "AP" return undefined)
          const safeKey = (str) => {
            if (!str) return null;
            const k = str.trim().toLowerCase();
            // Exact match
            if (CITY_COORDS[k]) return CITY_COORDS[k];
            // Block state abbreviations (≤2 chars)
            if (k.length <= 2) return null;
            // Try trimming common suffixes (e.g. "kakinada, ap" → try "kakinada")
            const tokens = k.split(/[\s,]+/).filter((t) => t.length >= 3);
            for (const tok of tokens) {
              if (CITY_COORDS[tok]) return CITY_COORDS[tok];
            }
            return null;
          };
          const sMatch = safeKey(selectedShip.source);
          const dMatch = safeKey(selectedShip.destination);

          if (sMatch) {
            updated.start_lat = String(sMatch.lat);
            updated.start_lng = String(sMatch.lng);
            setStartLabel(sMatch.name);
          }
          if (dMatch) {
            updated.end_lat = String(dMatch.lat);
            updated.end_lng = String(dMatch.lng);
            setEndLabel(dMatch.name);
          }

          if (sMatch && dMatch) {
            handleCalculateRoute(updated);
          } else {
            // Geocode fallback for cities not in CITY_COORDS
            (async () => {
              let sLat = sMatch ? sMatch.lat : null;
              let sLng = sMatch ? sMatch.lng : null;
              let sName = sMatch ? sMatch.name : selectedShip.source;
              let eLat = dMatch ? dMatch.lat : null;
              let eLng = dMatch ? dMatch.lng : null;
              let eName = dMatch ? dMatch.name : selectedShip.destination;

              if (!sMatch && selectedShip.source && selectedShip.source.trim().length > 2) {
                const g = await geocodeCity(selectedShip.source);
                if (g.length > 0) {
                  sLat = g[0].lat;
                  sLng = g[0].lng;
                  sName = g[0].name;
                }
              }
              if (!dMatch && selectedShip.destination && selectedShip.destination.trim().length > 2) {
                const g = await geocodeCity(selectedShip.destination);
                if (g.length > 0) {
                  eLat = g[0].lat;
                  eLng = g[0].lng;
                  eName = g[0].name;
                }
              }

              if (sLat && eLat) {
                setForm((cur) => {
                  const withCoords = {
                    ...cur,
                    start_lat: String(sLat),
                    start_lng: String(sLng),
                    end_lat: String(eLat),
                    end_lng: String(eLng),
                  };
                  setStartLabel(sName);
                  setEndLabel(eName);
                  handleCalculateRoute(withCoords);
                  return withCoords;
                });
              }
            })();
          }
        }
      }
      return updated;
    });
  };

  // Debounced city search using Nominatim
  const handleCitySearch = (value, type) => {
    if (type === "start") setStartQuery(value);
    else setEndQuery(value);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const results = await geocodeCity(value);
      if (type === "start") setStartResults(results);
      else setEndResults(results);
    }, 400);
  };

  const handleSelectCity = (city, type) => {
    setForm((prev) => {
      const updated =
        type === "start"
          ? { ...prev, start_lat: String(city.lat), start_lng: String(city.lng) }
          : { ...prev, end_lat: String(city.lat), end_lng: String(city.lng) };

      if (type === "start") {
        setStartLabel(city.name);
        setStartQuery("");
        setStartResults([]);
      } else {
        setEndLabel(city.name);
        setEndQuery("");
        setEndResults([]);
      }

      if (updated.start_lat && updated.end_lat) {
        handleCalculateRoute(updated);
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_id || !form.driver_id || !form.shipment_id) {
      setError("Please select Vehicle, Driver, and Shipment.");
      return;
    }
    if (!form.start_lat || !form.end_lat) {
      setError("Please select Start Location and Destination.");
      return;
    }
    setError("");
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        shipment_id: form.shipment_id,
        start_lat: Number(form.start_lat),
        start_lng: Number(form.start_lng),
        end_lat: Number(form.end_lat),
        end_lng: Number(form.end_lng),
        route_type: selectedRouteType,
      };
      const res = await createTrip(payload);
      setShowForm(false);
      await loadTrips();
      await loadDropdownData();
      setSelectedTrip(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong");
    }
  };

  const handleStart = async (tripId) => {
    setActionLoading(true);
    setError("");
    try {
      const res = await startTrip(tripId);
      await loadTrips();
      setSelectedTrip(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to start trip");
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async (tripId) => {
    setActionLoading(true);
    setError("");
    try {
      const res = await completeTrip(tripId);
      await loadTrips();
      await loadDropdownData();
      setSelectedTrip(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to complete trip");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (trip) => {
    setActionLoading(true);
    setError("");
    try {
      await deleteTrip(trip.trip_id);
      setDeleteConfirm(null);
      if (selectedTrip?.trip_id === trip.trip_id) {
        setSelectedTrip(null);
      }
      await loadTrips();
      await loadDropdownData();
    } catch (err) {
      setDeleteConfirm(null);
      setError(err.response?.data?.detail || "Failed to delete trip");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecalculate = async (trip) => {
    if (!trip) return;
    setActionLoading(true);
    setRerouteNotice("");
    try {
      const live = livePositions[trip.trip_id];
      const curLat = live ? live.lat : trip.start_lat;
      const curLng = live ? live.lng : trip.start_lng;

      const res = await recalculateTripRoute(trip.trip_id, {
        current_lat: curLat,
        current_lng: curLng,
        route_type: selectedRouteType,
      });

      setSelectedTrip(res.data);
      setRerouteNotice(`Route dynamically recalculated using '${selectedRouteType}' profile!`);
      loadTrips();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to recalculate route");
    } finally {
      setActionLoading(false);
    }
  };

  const displayTrips = isDriver
    ? trips.filter((t) => t.driver_id === user?.user_id || true)
    : trips;

  // Convert raw minutes to "Xh Ym" or "Ym" display
  const formatDuration = (minutes) => {
    if (!minutes && minutes !== 0) return "—";
    const totalMins = Math.round(Number(minutes));
    if (isNaN(totalMins)) return "—";
    if (totalMins < 60) return `${totalMins}m`;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}h ${m}m`;
  };

  // Format ETA time nicely (duration in minutes)
  const formatETA = (opt) => {
    if (!opt || !opt.duration) return "N/A";
    const now = new Date();
    const etaDate = new Date(now.getTime() + opt.duration * 60000);
    return etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {isDriver ? "My Assigned Trips" : "Route Optimization & Live Telemetry"}
            </h1>
            <p className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase mt-1">
              FLEET LOGISTICS & ROUTE INTELLIGENCE
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-400/80">
              OPERATOR: <strong className="text-cyan-300">{user?.full_name?.toUpperCase()} ({user?.role?.toUpperCase()})</strong>
            </span>
          </div>
        </div>

        {rerouteNotice && (
          <div className="bg-cyan-950/60 border border-cyan-800 p-3 rounded-xl text-cyan-300 text-xs font-semibold flex justify-between items-center">
            <span>🔄 {rerouteNotice}</span>
            <button onClick={() => setRerouteNotice("")} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-xs bg-red-950/40 p-3 border border-red-800 rounded-xl">{error}</p>}

        {/* Main Grid: Interactive Map HUD & Route Options */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Interactive Map & Live Telemetry */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap justify-between items-center gap-2">
              <div>
                <h3 className="font-bold text-sm text-white">
                  {selectedTrip
                    ? `Trip Tracking — ${selectedTrip.shipment?.source || "Source"} → ${selectedTrip.shipment?.destination || "Destination"} (ID: ${selectedTrip.trip_id ? selectedTrip.trip_id.slice(0, 8) : "N/A"}...)`
                    : trackedShipment
                    ? `Shipment: ${trackedShipment.source} → ${trackedShipment.destination}`
                    : "Select a Trip"}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedTrip
                    ? <>Strategy: <span className="text-cyan-400 font-semibold uppercase">{selectedTrip?.route_type || selectedRouteType}</span></>
                    : trackedShipment
                    ? <span className="text-amber-400">No trip assigned to this shipment yet</span>
                    : null}
                </p>
              </div>
              {selectedTrip && canManage && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleRecalculate(selectedTrip)}
                  className="px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-800 rounded-lg hover:bg-purple-500/30 text-xs font-semibold disabled:opacity-50"
                >
                  🔄 Recalculate Route
                </button>
              )}
            </div>

            {/* Show info banner when tracking a shipment with no trip yet */}
            {trackedShipmentId && !selectedTrip && trackedShipment && (
              <div className="bg-amber-950/30 border border-amber-700/60 rounded-xl px-4 py-3 text-xs text-amber-300 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <span>
                  Shipment <strong>{trackedShipment.tracking_number}</strong> ({trackedShipment.source} → {trackedShipment.destination}) has not been assigned a trip yet.
                  Go to <strong>+ Schedule Trip</strong> to create and assign a trip for live tracking.
                </span>
              </div>
            )}

            <TrackingMap
              trip={selectedTrip}
              trackedShipment={trackedShipment}
              livePosition={selectedTrip ? livePositions[selectedTrip.trip_id] : null}
              routeOptions={routeOptions}
              selectedRouteType={selectedRouteType}
              onSelectRouteType={(type) => setSelectedRouteType(type)}
            />
          </div>

          {/* Right Column: Trip Actions & Active List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold">{isDriver ? "Assigned Trips" : "Scheduled & Active Trips"}</h2>
              {canManage && (
                <button
                  onClick={openAddForm}
                  className="px-3 py-1.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400 shadow-lg shadow-cyan-500/20 transition"
                >
                  + Schedule Trip
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {displayTrips.map((t) => {
                const isSelected = selectedTrip?.trip_id === t.trip_id;
                const live = livePositions[t.trip_id];

                return (
                  <div
                    key={t.trip_id}
                    onClick={() => setSelectedTrip(t)}
                    className={`p-4 rounded-xl border transition cursor-pointer space-y-2 ${
                      isSelected
                        ? "bg-slate-900 border-cyan-500/80 shadow-lg"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-mono font-bold text-cyan-400 text-xs">
                          ID: {t.trip_id ? t.trip_id.slice(0, 8) : "N/A"}...
                        </p>
                        <p className="text-xs text-slate-400">
                          {t.start_lat}, {t.start_lng} → {t.end_lat}, {t.end_lng}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          STATUS_COLORS[t.status] || "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                      <span>📏 {t.distance ? `${t.distance} km` : "-"}</span>
                      <span>⏱️ {formatDuration(t.duration)}</span>
                      <span className="text-cyan-400 font-medium">{t.route_type || "fastest"}</span>
                    </div>

                    {live && (
                      <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        Live Speed: {live.speed} km/h (Step {live.progress_step}/{live.total_steps})
                      </div>
                    )}

                    {/* Trip Control Buttons */}
                    <div className="flex justify-end gap-2 pt-1">
                      {t.status === "Scheduled" && (
                        <button
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStart(t.trip_id);
                          }}
                          className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-800 rounded text-xs font-bold hover:bg-blue-500/30"
                        >
                          ▶ START TRIP
                        </button>
                      )}
                      {(t.status === "Active" || t.status === "Scheduled") && (
                        <button
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleComplete(t.trip_id);
                          }}
                          className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-800 rounded text-xs font-bold hover:bg-emerald-500/30"
                        >
                          ✔ COMPLETE TRIP
                        </button>
                      )}
                      {canManage && (
                        <button
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(t);
                          }}
                          className="px-2 py-1 bg-rose-500/20 text-rose-400 border border-rose-800 rounded text-xs hover:bg-rose-500/30"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {displayTrips.length === 0 && (
                <p className="text-xs text-slate-500 text-center p-4">No trips scheduled.</p>
              )}
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-rose-800/60 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🗑</span>
                <h3 className="text-lg font-bold text-white">Delete Trip?</h3>
              </div>
              <p className="text-slate-400 text-sm">
                Are you sure you want to permanently delete trip{" "}
                <span className="font-mono text-rose-400 font-semibold">
                  {deleteConfirm.trip_id ? deleteConfirm.trip_id.slice(0, 8) : "N/A"}...
                </span>?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm disabled:opacity-50"
                >
                  {actionLoading ? "Deleting..." : "Yes, Delete Trip"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Trip Scheduling Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto text-xs">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Schedule New Trip</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Available Vehicles Dropdown */}
                <div>
                  <label className="text-slate-400 mb-1 block font-semibold">Select Available Vehicle *</label>
                  <select
                    name="vehicle_id"
                    value={form.vehicle_id}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Available Vehicle --</option>
                    {vehicles
                      .filter((v) => v.status === "Available")
                      .map((v) => (
                        <option key={v.vehicle_id} value={v.vehicle_id}>
                          {v.registration_number} ({v.brand} {v.model}) — Capacity: {v.capacity}kg
                        </option>
                      ))}
                  </select>
                </div>

                {/* Available Drivers Dropdown */}
                <div>
                  <label className="text-slate-400 mb-1 block font-semibold">Select Available Driver *</label>
                  <select
                    name="driver_id"
                    value={form.driver_id}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Available Driver --</option>
                    {drivers
                      .filter((d) => d.status === "Available")
                      .map((d) => (
                        <option key={d.driver_id} value={d.driver_id}>
                          {d.full_name} — Available ({d.license_number || `DRV-${d.driver_id.slice(0, 6)}`})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Created Shipments Dropdown */}
                <div>
                  <label className="text-slate-400 mb-1 block font-semibold">Select Created Shipment *</label>
                  <select
                    name="shipment_id"
                    value={form.shipment_id}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Created Shipment --</option>
                    {shipments.map((s) => (
                      <option key={s.shipment_id} value={s.shipment_id}>
                        {s.tracking_number} ({s.source} → {s.destination}) — Customer: {s.customer_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Select City Controls */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <p className="text-slate-300 font-semibold">Quick Select Route Cities:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_CITIES.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          if (!form.start_lat) handleSelectCity(c, "start");
                          else handleSelectCity(c, "end");
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 text-slate-300 border border-slate-700 rounded-lg text-[10px] font-medium"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Location Input */}
                <div className="relative">
                  <label className="text-slate-400 mb-1 block">Start Location {startLabel && <span className="text-cyan-400 font-bold">({startLabel})</span>}</label>
                  <input
                    type="text"
                    placeholder="Search start city..."
                    value={startQuery}
                    onChange={(e) => handleCitySearch(e.target.value, "start")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                  {startResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-slate-900 border border-slate-700 rounded-lg mt-1 max-h-40 overflow-y-auto">
                      {startResults.map((r, i) => (
                        <div
                          key={i}
                          onClick={() => handleSelectCity(r, "start")}
                          className="p-2 hover:bg-slate-800 cursor-pointer text-slate-300 text-[11px]"
                        >
                          {r.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Destination Input */}
                <div className="relative">
                  <label className="text-slate-400 mb-1 block">Destination {endLabel && <span className="text-cyan-400 font-bold">({endLabel})</span>}</label>
                  <input
                    type="text"
                    placeholder="Search destination city..."
                    value={endQuery}
                    onChange={(e) => handleCitySearch(e.target.value, "end")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                  {endResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-slate-900 border border-slate-700 rounded-lg mt-1 max-h-40 overflow-y-auto">
                      {endResults.map((r, i) => (
                        <div
                          key={i}
                          onClick={() => handleSelectCity(r, "end")}
                          className="p-2 hover:bg-slate-800 cursor-pointer text-slate-300 text-[11px]"
                        >
                          {r.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CALCULATE ROUTE BUTTON */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleCalculateRoute()}
                    disabled={calculatingRoute}
                    className="w-full py-2 bg-purple-950/80 hover:bg-purple-900 border border-purple-700 text-purple-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <span>⚡ CALCULATE ROUTE OPTIONS</span>
                    {calculatingRoute && <span className="animate-spin">🌀</span>}
                  </button>
                </div>

                {/* Route Options Preview */}
                {routeOptions && (
                  <div className="bg-slate-950 border border-cyan-500/40 rounded-xl p-3 space-y-2">
                    <p className="font-bold text-cyan-400 text-xs flex justify-between items-center">
                      <span>🗺️ ROUTE OPTIMIZATION STRATEGIES</span>
                      <span className="text-[10px] text-slate-400">Click card to select strategy</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(routeOptions).map(([type, opt]) => {
                        const isSelected = selectedRouteType === type;
                        return (
                          <div
                            key={type}
                            onClick={() => setSelectedRouteType(type)}
                            className={`p-2.5 rounded-xl border cursor-pointer transition space-y-1 ${
                              isSelected
                                ? "border-cyan-500 bg-cyan-950/50 text-cyan-200 shadow-md shadow-cyan-500/20"
                                : "border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-300"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <p className="font-bold text-[11px] text-white uppercase">{opt.name}</p>
                              {isSelected && <span className="text-cyan-400 text-[10px]">✔ SELECTED</span>}
                            </div>
                            <div className="text-[10px] space-y-0.5 font-mono">
                              <p>📏 Distance: <strong className="text-white">{opt.distance} km</strong></p>
                              <p>⏱️ Duration: <strong className="text-white">{formatDuration(opt.duration)}</strong></p>
                              <p>🕒 Est. ETA: <strong className="text-cyan-300">{formatETA(opt)}</strong></p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold rounded-xl hover:bg-cyan-400"
                  >
                    Schedule & Create Trip
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}