import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
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

// Popular Indian cities for quick selection
const QUICK_CITIES = [
  { name: "New Delhi",  lat: 28.6139, lng: 77.2090 },
  { name: "Mumbai",     lat: 19.0760, lng: 72.8777 },
  { name: "Bangalore",  lat: 12.9716, lng: 77.5946 },
  { name: "Chennai",    lat: 13.0827, lng: 80.2707 },
  { name: "Hyderabad",  lat: 17.3850, lng: 78.4867 },
  { name: "Kolkata",    lat: 22.5726, lng: 88.3639 },
  { name: "Pune",       lat: 18.5204, lng: 73.8567 },
  { name: "Ahmedabad",  lat: 23.0225, lng: 72.5714 },
  { name: "Jaipur",     lat: 26.9124, lng: 75.7873 },
  { name: "Lucknow",    lat: 26.8467, lng: 80.9462 },
  { name: "Surat",      lat: 21.1702, lng: 72.8311 },
  { name: "Nagpur",     lat: 21.1458, lng: 79.0882 },
];

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
  const { user, logout } = useAuth();
  const canManage =
    user?.role === "Admin" ||
    user?.role === "FleetManager" ||
    user?.role === "Dispatcher";

  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [livePositions, setLivePositions] = useState({});
  const [routeOptions, setRouteOptions] = useState(null);
  const [selectedRouteType, setSelectedRouteType] = useState("fastest");
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

  const loadTrips = async () => {
    try {
      const res = await getTrips();
      setTrips(res.data);
      if (res.data.length > 0 && !selectedTrip) {
        setSelectedTrip(res.data[0]);
      }
    } catch (err) {
      setError("Failed to load trips");
    }
  };

  const loadDropdownData = async () => {
    try {
      const [vehRes, shipRes] = await Promise.all([
        getVehicles(),
        getShipments(),
      ]);
      setVehicles(vehRes.data);
      setShipments(shipRes.data.filter((s) => s.status === "Created"));
    } catch (err) {
      // non-fatal
    }
  };

  // WebSocket Live GPS Telemetry Subscriber
  useEffect(() => {
    loadTrips();
    loadDropdownData();

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

  // Fetch route options when coordinates change in form or trip selection
  useEffect(() => {
    if (showForm && form.start_lat && form.start_lng && form.end_lat && form.end_lng) {
      fetchRouteOptions({
        start_lat: Number(form.start_lat),
        start_lng: Number(form.start_lng),
        end_lat: Number(form.end_lat),
        end_lng: Number(form.end_lng),
      })
        .then((res) => setRouteOptions(res.data))
        .catch(() => {});
    }
  }, [showForm, form.start_lat, form.start_lng, form.end_lat, form.end_lng]);

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
    setForm({ ...form, [e.target.name]: e.target.value });
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

  // Called when user picks a city from the dropdown or quick-select
  const handleSelectCity = (city, type) => {
    if (type === "start") {
      setForm((prev) => ({ ...prev, start_lat: String(city.lat), start_lng: String(city.lng) }));
      setStartLabel(city.name);
      setStartQuery("");
      setStartResults([]);
    } else {
      setForm((prev) => ({ ...prev, end_lat: String(city.lat), end_lng: String(city.lng) }));
      setEndLabel(city.name);
      setEndQuery("");
      setEndResults([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      loadTrips();
      loadDropdownData();
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
      loadTrips();
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
      loadTrips();
      loadDropdownData();
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

  return (
    <div className="flex min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Route Optimization & Live Telemetry
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
                  {selectedTrip ? `Trip Tracking - ID: ${selectedTrip.trip_id ? selectedTrip.trip_id.slice(0, 8) : "N/A"}...` : "Select a Trip"}
                </h3>
                <p className="text-xs text-slate-400">
                  Strategy: <span className="text-cyan-400 font-semibold uppercase">{selectedTrip?.route_type || selectedRouteType}</span>
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

            <TrackingMap
              trip={selectedTrip}
              livePosition={selectedTrip ? livePositions[selectedTrip.trip_id] : null}
              routeOptions={routeOptions}
              selectedRouteType={selectedRouteType}
              onSelectRouteType={(type) => setSelectedRouteType(type)}
            />
          </div>

          {/* Right Column: Trip Actions & Active List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold">Scheduled & Active Trips</h2>
              {canManage && (
                <button
                  onClick={openAddForm}
                  className="px-3 py-1.5 bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg hover:bg-cyan-400"
                >
                  + Schedule Trip
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {trips.map((t) => {
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
                      <span>⏱️ {t.duration ? `${t.duration} min` : "-"}</span>
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
                          Start Trip
                        </button>
                      )}
                      {t.status === "Active" && (
                        <button
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleComplete(t.trip_id);
                          }}
                          className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-800 rounded text-xs font-bold hover:bg-emerald-500/30"
                        >
                          End & Deliver Trip
                        </button>
                      )}
                      {canManage && (
                        <button
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(t);
                          }}
                          className="px-3 py-1 bg-rose-500/20 text-rose-400 border border-rose-800 rounded text-xs font-bold hover:bg-rose-500/30"
                        >
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {trips.length === 0 && (
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
                This action cannot be undone.
              </p>
              <div className="bg-slate-950/60 rounded-lg p-3 text-xs text-slate-400 space-y-1 border border-slate-800">
                <p>Status: <span className="text-white font-semibold">{deleteConfirm.status}</span></p>
                <p>Route: {deleteConfirm.start_lat}, {deleteConfirm.start_lng} → {deleteConfirm.end_lat}, {deleteConfirm.end_lng}</p>
              </div>
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
              <h3 className="text-lg font-bold text-white">Schedule New Trip</h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-slate-400 mb-1 block">Vehicle</label>
                  <select
                    name="vehicle_id"
                    value={form.vehicle_id}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  >
                    <option value="">Select Available Vehicle</option>
                    {vehicles
                      .filter((v) => v.status === "Available")
                      .map((v) => (
                        <option key={v.vehicle_id} value={v.vehicle_id}>
                          {v.registration_number} ({v.brand} {v.model})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 mb-1 block">Driver ID (UUID)</label>
                  <input
                    name="driver_id"
                    value={form.driver_id}
                    onChange={handleChange}
                    placeholder="Driver UUID"
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="text-slate-400 mb-1 block">Shipment</label>
                  <select
                    name="shipment_id"
                    value={form.shipment_id}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  >
                    <option value="">Select Created Shipment</option>
                    {shipments.map((s) => (
                      <option key={s.shipment_id} value={s.shipment_id}>
                        {s.tracking_number} ({s.source} → {s.destination})
                      </option>
                    ))}
                  </select>
                </div>

                {/* ── Location Search ───────────────────────────────── */}
                <div className="space-y-3">
                  <label className="text-cyan-400 font-semibold block text-xs">📍 Quick Select City</label>
                  {/* Quick-pick chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_CITIES.map((c) => (
                      <div key={c.name} className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleSelectCity(c, "start")}
                          title={`Set ${c.name} as Start`}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium border transition ${
                            startLabel === c.name
                              ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
                              : "bg-slate-800 border-slate-700 text-slate-400 hover:border-cyan-600 hover:text-white"
                          }`}
                        >
                          🟢 {c.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectCity(c, "end")}
                          title={`Set ${c.name} as End`}
                          className={`px-2 py-1 rounded-md text-[10px] font-medium border transition ${
                            endLabel === c.name
                              ? "bg-rose-500/20 border-rose-500 text-rose-300"
                              : "bg-slate-800 border-slate-700 text-slate-400 hover:border-rose-600 hover:text-white"
                          }`}
                        >
                          🔴
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Search inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Start Location */}
                    <div className="relative">
                      <label className="text-slate-400 mb-1 block">🟢 Start Location</label>
                      {startLabel && (
                        <div className="flex items-center gap-1 bg-cyan-950/40 border border-cyan-800 rounded-lg px-2 py-1 mb-1 text-[10px] text-cyan-300">
                          <span className="truncate">{startLabel}</span>
                          <button type="button" onClick={() => { setStartLabel(""); setForm(p=>({...p,start_lat:"",start_lng:""})); }} className="ml-auto text-slate-400 hover:text-white">✕</button>
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="Search city… e.g. Bangalore"
                        value={startQuery}
                        onChange={(e) => handleCitySearch(e.target.value, "start")}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                      />
                      {startResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-40 overflow-y-auto">
                          {startResults.map((r, i) => (
                            <button key={i} type="button" onClick={() => handleSelectCity(r, "start")}
                              className="w-full text-left px-3 py-2 text-[11px] text-slate-300 hover:bg-cyan-950/60 hover:text-white border-b border-slate-800 last:border-0 truncate">
                              📍 {r.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Hidden required fields */}
                      <input type="hidden" name="start_lat" value={form.start_lat} required />
                      <input type="hidden" name="start_lng" value={form.start_lng} required />
                    </div>

                    {/* End Location */}
                    <div className="relative">
                      <label className="text-slate-400 mb-1 block">🔴 End Location</label>
                      {endLabel && (
                        <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-800 rounded-lg px-2 py-1 mb-1 text-[10px] text-rose-300">
                          <span className="truncate">{endLabel}</span>
                          <button type="button" onClick={() => { setEndLabel(""); setForm(p=>({...p,end_lat:"",end_lng:""})); }} className="ml-auto text-slate-400 hover:text-white">✕</button>
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="Search city… e.g. Chennai"
                        value={endQuery}
                        onChange={(e) => handleCitySearch(e.target.value, "end")}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white text-xs"
                      />
                      {endResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-40 overflow-y-auto">
                          {endResults.map((r, i) => (
                            <button key={i} type="button" onClick={() => handleSelectCity(r, "end")}
                              className="w-full text-left px-3 py-2 text-[11px] text-slate-300 hover:bg-rose-950/60 hover:text-white border-b border-slate-800 last:border-0 truncate">
                              🏁 {r.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <input type="hidden" name="end_lat" value={form.end_lat} required />
                      <input type="hidden" name="end_lng" value={form.end_lng} required />
                    </div>
                  </div>

                  {/* Selected coordinates display */}
                  {(form.start_lat || form.end_lat) && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                      {form.start_lat && (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-400">
                          Start: {Number(form.start_lat).toFixed(4)}, {Number(form.start_lng).toFixed(4)}
                        </div>
                      )}
                      {form.end_lat && (
                        <div className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-400">
                          End: {Number(form.end_lat).toFixed(4)}, {Number(form.end_lng).toFixed(4)}
                        </div>
                      )}
                    </div>
                  )}
                  {!form.start_lat && <p className="text-amber-400 text-[10px]">⚠️ Please select a Start location above</p>}
                  {form.start_lat && !form.end_lat && <p className="text-amber-400 text-[10px]">⚠️ Please select an End location above</p>}
                </div>

                {/* Route Strategy Selection */}
                {routeOptions && (
                  <div>
                    <label className="text-cyan-400 font-semibold mb-1 block">Select Route Strategy Profile</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(routeOptions).map(([type, opt]) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSelectedRouteType(type)}
                          className={`p-2.5 rounded-lg border text-left transition ${
                            selectedRouteType === type
                              ? "border-cyan-500 bg-cyan-950/60 text-white font-bold"
                              : "border-slate-800 bg-slate-950 text-slate-400"
                          }`}
                        >
                          <p className="font-semibold text-xs">{opt.name}</p>
                          <p className="text-[10px] text-slate-300">{opt.distance} km • {opt.duration} mins</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold rounded-lg hover:bg-cyan-400"
                  >
                    Schedule Trip
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