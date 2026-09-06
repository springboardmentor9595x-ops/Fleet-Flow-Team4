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
import { getCityCoordinates } from "../utils/cityUtils";

const QUICK_CITIES = [
  "Kakinada",
  "Vizag",
  "Vijayawada",
  "Hyderabad",
  "Rajahmundry",
  "Guntur",
  "Tirupati",
  "Chennai",
  "Bangalore",
];

// Dynamic geocoding using Nominatim OpenStreetMap (No hardcoded coordinates)
async function geocodeCity(query) {
  if (!query || String(query).trim().length < 2) return null;

  let cleanQuery = String(query).trim();
  if (cleanQuery.toLowerCase() === "vizag") {
    cleanQuery = "Visakhapatnam, Andhra Pradesh, India";
  } else if (!cleanQuery.toLowerCase().includes("india") && !cleanQuery.toLowerCase().includes(",")) {
    cleanQuery = `${cleanQuery}, Andhra Pradesh, India`;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=1&countrycodes=in`;
    const res = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "FleetFlow-Logistic-Platform/1.0",
      },
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        return {
          name: data[0].display_name,
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lon.toFixed(6)),
        };
      }
    }
  } catch (err) {
    console.error("Geocoding request failed:", err);
  }

  // Fallback search without country/state modifier
  try {
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(fallbackUrl, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "FleetFlow-Logistic-Platform/1.0",
      },
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        return {
          name: data[0].display_name,
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lon.toFixed(6)),
        };
      }
    }
  } catch (_) {}

  return null;
}

const emptyForm = {
  vehicle_id: "",
  driver_id: "",
  shipment_id: "",
  start_city: "",
  end_city: "",
  start_lat: "",
  start_lng: "",
  end_lat: "",
  end_lng: "",
  route_type: "fastest",
};

const STATUS_COLORS = {
  Scheduled: "bg-slate-100 text-slate-600 border-slate-300",
  Active: "bg-blue-50 text-blue-700 border-blue-300",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-300",
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
  const [shipments, setShipments] = useState([]);
  const [allShipments, setAllShipments] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [trackedShipment, setTrackedShipment] = useState(null);
  const [livePositions, setLivePositions] = useState({});

  // Route options for map vs modal
  const [tripRouteOptions, setTripRouteOptions] = useState(null);
  const [modalRouteOptions, setModalRouteOptions] = useState(null);

  const [selectedRouteType, setSelectedRouteType] = useState("fastest");
  const [modalRouteType, setModalRouteType] = useState("fastest");
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [rerouteNotice, setRerouteNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [modalError, setModalError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const socketRef = useRef(null);

  // Auto-fetch route options whenever a trip is selected on the main page
  useEffect(() => {
    if (selectedTrip && selectedTrip.start_lat && selectedTrip.end_lat) {
      setSelectedRouteType(selectedTrip.route_type || "fastest");
      fetchRouteOptions({
        start_lat: Number(selectedTrip.start_lat),
        start_lng: Number(selectedTrip.start_lng),
        end_lat: Number(selectedTrip.end_lat),
        end_lng: Number(selectedTrip.end_lng),
      })
        .then((res) => setTripRouteOptions(res.data))
        .catch(() => {});
    }
  }, [selectedTrip?.trip_id]);

  const formatDuration = (minutes) => {
    if (!minutes && minutes !== 0) return "—";
    const totalMins = Math.round(Number(minutes));
    if (isNaN(totalMins)) return "—";
    if (totalMins < 60) return `${totalMins}m`;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}h ${m}m`;
  };

  const formatTripETA = (t) => {
    if (t.status === "Completed") {
      if (t.end_time) {
        try {
          return `Delivered (${new Date(t.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
        } catch (_) {}
      }
      return "Delivered";
    }
    if (t.eta) {
      try {
        const d = new Date(t.eta);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
      } catch (_) {}
    }
    if (t.duration) {
      const now = new Date();
      const d = new Date(now.getTime() + Number(t.duration) * 60000);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return "Pending Start";
  };

  const formatETA = (opt) => {
    if (!opt || !opt.duration) return "Calculated on start";
    const now = new Date();
    const etaDate = new Date(now.getTime() + Number(opt.duration) * 60000);
    return etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const loadTrips = async (allShipmentsData = null, existingTripList = null) => {
    try {
      const tripList = existingTripList !== null ? existingTripList : ((await getTrips()).data || []);
      setTrips(tripList);

      if (trackedShipmentId) {
        const found = tripList.find((t) => String(t.shipment_id) === String(trackedShipmentId));
        if (found) {
          setSelectedTrip(found);
          setTrackedShipment(null);
        } else {
          setSelectedTrip(null);
          const shipmentsSource = allShipmentsData || allShipments || [];
          const ship = shipmentsSource.find((s) => String(s.shipment_id) === String(trackedShipmentId));
          if (ship) setTrackedShipment(ship);
        }
      } else if (tripList.length > 0) {
        setSelectedTrip((prev) => {
          if (!prev) return tripList[0];
          const updated = tripList.find((t) => t.trip_id === prev.trip_id);
          return updated || tripList[0];
        });
      }
    } catch (err) {
      setError("Failed to load trips");
    }
  };

  const loadDropdownData = async (currentTrips = []) => {
    try {
      const [vehRes, shipRes, drvRes] = await Promise.all([
        getVehicles().catch(() => ({ data: [] })),
        getShipments().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
      ]);
      setVehicles(vehRes.data || []);
      const allShips = shipRes.data || [];

      // Set of shipment IDs already assigned to a Scheduled or Active trip
      const scheduledTripShipmentIds = new Set(
        currentTrips
          .filter((t) => t.status === "Scheduled" || t.status === "Active")
          .map((t) => String(t.shipment_id))
      );

      // Eligible shipments: not Delivered, not Cancelled, and not already scheduled/active on a trip
      const eligibleShips = allShips.filter((s) => {
        if (!s || !s.shipment_id) return false;
        if (s.status === "Delivered" || s.status === "Cancelled") return false;
        if (scheduledTripShipmentIds.has(String(s.shipment_id))) return false;
        return true;
      });

      setShipments(eligibleShips);
      setAllShipments(allShips);
      setDrivers(drvRes.data || []);
      return allShips;
    } catch (err) {
      return [];
    }
  };

  const loadData = async () => {
    try {
      const tripRes = await getTrips();
      const tripList = tripRes.data || [];
      const allShips = await loadDropdownData(tripList);
      await loadTrips(allShips, tripList);
    } catch (err) {
      setError("Failed to load data");
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadData();
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
      } catch (e) {}
    };

    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const openAddForm = () => {
    const initialShipmentId = trackedShipmentId || "";
    setForm(emptyForm);
    setModalRouteType("fastest");
    setModalError("");
    setModalRouteOptions(null);
    setShowForm(true);
    if (initialShipmentId) {
      handleShipmentSelect(initialShipmentId);
    }
  };

  const calculateRouteForForm = async (targetForm) => {
    setModalError("");
    setModalRouteOptions(null);

    let sLat = targetForm.start_lat;
    let sLng = targetForm.start_lng;
    let eLat = targetForm.end_lat;
    let eLng = targetForm.end_lng;

    // Dynamically geocode if missing or city text changed
    if ((!sLat || !sLng) && targetForm.start_city) {
      const sCoords = getCityCoordinates(targetForm.start_city);
      if (sCoords) {
        sLat = sCoords.lat;
        sLng = sCoords.lng;
      } else {
        const sGeo = await geocodeCity(targetForm.start_city);
        if (sGeo) {
          sLat = sGeo.latitude;
          sLng = sGeo.longitude;
        }
      }
    }
    if ((!eLat || !eLng) && targetForm.end_city) {
      const eCoords = getCityCoordinates(targetForm.end_city);
      if (eCoords) {
        eLat = eCoords.lat;
        eLng = eCoords.lng;
      } else {
        const eGeo = await geocodeCity(targetForm.end_city);
        if (eGeo) {
          eLat = eGeo.latitude;
          eLng = eGeo.longitude;
        }
      }
    }

    if (!sLat || !sLng || !eLat || !eLng) {
      setModalError("Please enter valid Origin and Destination cities (e.g. Kakinada → Vizag).");
      return;
    }

    // Verify & log coordinates before calling route API
    console.log("origin:", {
      latitude: Number(sLat),
      longitude: Number(sLng),
    });
    console.log("destination:", {
      latitude: Number(eLat),
      longitude: Number(eLng),
    });

    setForm((prev) => ({
      ...prev,
      start_lat: String(sLat),
      start_lng: String(sLng),
      end_lat: String(eLat),
      end_lng: String(eLng),
    }));

    setCalculatingRoute(true);
    try {
      const res = await fetchRouteOptions({
        start_lat: Number(sLat),
        start_lng: Number(sLng),
        end_lat: Number(eLat),
        end_lng: Number(eLng),
      });
      setModalRouteOptions(res.data);
    } catch (err) {
      setModalError("Could not calculate live route options for these coordinates.");
    } finally {
      setCalculatingRoute(false);
    }
  };

  const handleShipmentSelect = async (shipmentId) => {
    if (!shipmentId) {
      setForm((prev) => ({ ...prev, shipment_id: "" }));
      return;
    }

    const selectedShip =
      allShipments.find((s) => String(s.shipment_id) === String(shipmentId)) ||
      shipments.find((s) => String(s.shipment_id) === String(shipmentId));

    if (!selectedShip) {
      setForm((prev) => ({ ...prev, shipment_id: shipmentId }));
      return;
    }

    setModalRouteOptions(null);

    let sLat = "";
    let sLng = "";
    const sCoords = getCityCoordinates(selectedShip.source);
    if (sCoords) {
      sLat = String(sCoords.lat);
      sLng = String(sCoords.lng);
    } else {
      const sGeo = await geocodeCity(selectedShip.source);
      if (sGeo) {
        sLat = String(sGeo.latitude);
        sLng = String(sGeo.longitude);
      }
    }

    let eLat = "";
    let eLng = "";
    const eCoords = getCityCoordinates(selectedShip.destination);
    if (eCoords) {
      eLat = String(eCoords.lat);
      eLng = String(eCoords.lng);
    } else {
      const eGeo = await geocodeCity(selectedShip.destination);
      if (eGeo) {
        eLat = String(eGeo.latitude);
        eLng = String(eGeo.longitude);
      }
    }

    const updated = {
      ...form,
      shipment_id: shipmentId,
      vehicle_id: selectedShip.vehicle_id || form.vehicle_id || "",
      driver_id: selectedShip.driver_id || form.driver_id || "",
      start_city: selectedShip.source,
      end_city: selectedShip.destination,
      start_lat: sLat,
      start_lng: sLng,
      end_lat: eLat,
      end_lng: eLng,
    };

    setForm(updated);
    if (sLat && eLat) {
      calculateRouteForForm(updated);
    }
  };

  const handleCityChange = async (type, cityName) => {
    setModalRouteOptions(null);
    const updated = {
      ...form,
      [type === "start" ? "start_city" : "end_city"]: cityName,
      [type === "start" ? "start_lat" : "end_lat"]: "",
      [type === "start" ? "start_lng" : "end_lng"]: "",
    };
    setForm(updated);

    if (cityName.length >= 3) {
      const geo = await geocodeCity(cityName);
      if (geo) {
        const withCoords = {
          ...updated,
          [type === "start" ? "start_lat" : "end_lat"]: String(geo.latitude),
          [type === "start" ? "start_lng" : "end_lng"]: String(geo.longitude),
        };
        setForm(withCoords);
        if (withCoords.start_lat && withCoords.end_lat) {
          calculateRouteForForm(withCoords);
        }
      }
    }
  };

  const handleQuickCity = async (cityName, type) => {
    setModalRouteOptions(null);
    const geo = await geocodeCity(cityName);
    const updated = {
      ...form,
      [type === "start" ? "start_city" : "end_city"]: cityName,
      [type === "start" ? "start_lat" : "end_lat"]: geo ? String(geo.latitude) : "",
      [type === "start" ? "start_lng" : "end_lng"]: geo ? String(geo.longitude) : "",
    };
    setForm(updated);
    if (updated.start_lat && updated.end_lat) {
      calculateRouteForForm(updated);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setModalError("");

    if (!form.shipment_id) {
      setModalError("Please choose a shipment to schedule.");
      return;
    }
    if (!form.vehicle_id) {
      setModalError("Please select an available vehicle.");
      return;
    }
    if (!form.driver_id) {
      setModalError("Please select an available driver.");
      return;
    }

    let sLat = form.start_lat;
    let sLng = form.start_lng;
    let eLat = form.end_lat;
    let eLng = form.end_lng;

    if ((!sLat || !sLng) && form.start_city) {
      const sCoords = getCityCoordinates(form.start_city);
      if (sCoords) {
        sLat = sCoords.lat;
        sLng = sCoords.lng;
      } else {
        const sGeo = await geocodeCity(form.start_city);
        if (sGeo) { sLat = sGeo.latitude; sLng = sGeo.longitude; }
      }
    }
    if ((!eLat || !eLng) && form.end_city) {
      const eCoords = getCityCoordinates(form.end_city);
      if (eCoords) {
        eLat = eCoords.lat;
        eLng = eCoords.lng;
      } else {
        const eGeo = await geocodeCity(form.end_city);
        if (eGeo) { eLat = eGeo.latitude; eLng = eGeo.longitude; }
      }
    }

    if (!sLat || !sLng || !eLat || !eLng) {
      setModalError("Origin or Destination coordinates missing. Please enter valid cities (e.g. Kakinada → Vizag).");
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id,
        shipment_id: form.shipment_id,
        start_lat: Number(sLat),
        start_lng: Number(sLng),
        end_lat: Number(eLat),
        end_lng: Number(eLng),
        route_type: modalRouteType || "fastest",
      };

      const res = await createTrip(payload);
      setShowForm(false);
      setForm(emptyForm);
      setModalRouteOptions(null);
      setSuccessMsg("Trip scheduled successfully!");
      await loadData();
      setSelectedTrip(res.data);
    } catch (err) {
      setModalError(err.response?.data?.detail || "Failed to schedule trip.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async (tripId) => {
    setActionLoading(true);
    setError("");
    try {
      const res = await startTrip(tripId);
      await loadData();
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
      await loadData();
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
      await loadData();
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
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to recalculate route");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {isDriver ? "My Assigned Trips" : "Route Optimization & Live Telemetry"}
            </h1>
            <p className="text-xs font-mono font-bold tracking-wider text-blue-600 uppercase mt-1">
              FLEET LOGISTICS & ROUTE INTELLIGENCE
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition"
            >
              🔄 Refresh
            </button>
            <span className="text-xs font-mono text-slate-500">
              OPERATOR: <strong className="text-slate-700">{user?.full_name?.toUpperCase()} ({user?.role?.toUpperCase()})</strong>
            </span>
          </div>
        </div>

        {rerouteNotice && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-700 text-xs font-semibold flex justify-between items-center">
            <span>🔄 {rerouteNotice}</span>
            <button onClick={() => setRerouteNotice("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex justify-between items-center rounded-xl">
            <span>✓ {successMsg}</span>
            <button onClick={() => setSuccessMsg("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-rose-700 text-xs font-semibold flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {/* Main Grid: Interactive Map HUD & Route Options */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Interactive Map & Live Telemetry */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-wrap justify-between items-center gap-2 shadow-sm">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {selectedTrip
                    ? `Trip Tracking — ${selectedTrip.tracking_number ? `${selectedTrip.tracking_number}: ` : ""}${selectedTrip.origin && selectedTrip.destination ? `${selectedTrip.origin} → ${selectedTrip.destination}` : `ID: ${selectedTrip.trip_id ? selectedTrip.trip_id.slice(0, 8) : "N/A"}...`}`
                    : trackedShipment
                    ? `Shipment: ${trackedShipment.tracking_number ? `${trackedShipment.tracking_number}: ` : ""}${trackedShipment.source} → ${trackedShipment.destination}`
                    : "Select a Trip"}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedTrip
                    ? <>Strategy: <span className="text-blue-600 font-semibold uppercase">{selectedTrip?.route_type || selectedRouteType}</span></>
                    : trackedShipment
                    ? <span className="text-amber-600">No trip assigned to this shipment yet</span>
                    : null}
                </p>
              </div>
              {selectedTrip && canManage && (
                <button
                  disabled={actionLoading}
                  onClick={() => handleRecalculate(selectedTrip)}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 text-xs font-semibold disabled:opacity-50"
                >
                  🔄 Recalculate Route
                </button>
              )}
            </div>

            <TrackingMap
              trip={selectedTrip}
              trackedShipment={trackedShipment}
              livePosition={selectedTrip ? livePositions[selectedTrip.trip_id] : null}
              routeOptions={tripRouteOptions}
              selectedRouteType={selectedRouteType}
              onSelectRouteType={(type) => setSelectedRouteType(type)}
            />
          </div>

          {/* Right Column: Trip Actions & Active List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-900">{isDriver ? "Assigned Trips" : "Scheduled & Active Trips"}</h2>
              {canManage && (
                <button
                  onClick={openAddForm}
                  className="px-3.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
                >
                  <span>+ Schedule Trip</span>
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
                        ? "bg-blue-50 border-blue-400 shadow-md"
                        : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          {t.tracking_number ? (
                            <span className="font-bold text-blue-600">📦 {t.tracking_number}</span>
                          ) : (
                            <span className="font-bold text-blue-600">ID: {t.trip_id ? t.trip_id.slice(0, 8) : "N/A"}...</span>
                          )}
                          {t.customer_name && (
                            <span className="text-slate-400 text-[11px]">({t.customer_name})</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-800 font-semibold mt-0.5">
                          {t.origin && t.destination
                            ? `${t.origin} ➔ ${t.destination}`
                            : `${t.start_lat}, ${t.start_lng} → ${t.end_lat}, ${t.end_lng}`}
                        </p>
                        <div className="space-y-0.5 text-[11px] text-slate-500 font-mono mt-1">
                          {t.assigned_driver_name && (
                            <p>
                              👤 Driver: <span className="font-bold text-slate-700">{t.assigned_driver_name}</span>
                            </p>
                          )}
                          {t.assigned_vehicle_reg && (
                            <p>
                              🚚 Vehicle: <span className="font-bold text-slate-700">{t.assigned_vehicle_reg}</span>
                              {t.assigned_vehicle_model ? ` (${t.assigned_vehicle_model})` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          STATUS_COLORS[t.status] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap justify-between items-center text-[11px] text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200 gap-1.5 font-mono">
                      <span>📏 {t.distance ? `${t.distance} km` : "—"}</span>
                      <span>⏱️ {formatDuration(t.duration)}</span>
                      <span>🕒 ETA: <strong className="text-blue-600 font-bold">{formatTripETA(t)}</strong></span>
                      <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold uppercase text-[9px] border border-blue-200">
                        {t.route_type || "fastest"}
                      </span>
                    </div>

                    {live && (
                      <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                        Live Speed: {live.speed} km/h (Step {live.progress_step}/{live.total_steps})
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      {t.status === "Scheduled" && (
                        <button
                          disabled={actionLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStart(t.trip_id);
                          }}
                          className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-bold hover:bg-blue-100"
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
                          className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs font-bold hover:bg-emerald-100"
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
                          className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded text-xs hover:bg-rose-100"
                        >
                          🗑
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
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🗑</span>
                <h3 className="text-lg font-bold text-slate-900">Delete Trip?</h3>
              </div>
              <p className="text-slate-600 text-sm">
                Are you sure you want to permanently delete trip{" "}
                <span className="font-mono text-rose-600 font-semibold">
                  {deleteConfirm.trip_id ? deleteConfirm.trip_id.slice(0, 8) : "N/A"}...
                </span>?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm disabled:opacity-50"
                >
                  {actionLoading ? "Deleting..." : "Yes, Delete Trip"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Trip Scheduling Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 font-sans">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto text-xs text-slate-900">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Schedule New Trip</h3>
                  <p className="text-[11px] text-slate-500 font-mono">Assign shipment, select vehicle/driver & compute optimized route</p>
                </div>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 font-bold text-base">✕</button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl flex items-center justify-between">
                  <span>⚠️ {modalError}</span>
                  <button onClick={() => setModalError("")} className="text-rose-400 hover:text-rose-600">✕</button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* 1. Choose Shipment Selection */}
                <div>
                  <label className="text-slate-700 mb-1 block font-semibold">1. Choose Shipment *</label>
                  <select
                    value={form.shipment_id}
                    onChange={(e) => handleShipmentSelect(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="">-- Choose Shipment --</option>
                    {shipments.map((s) => (
                      <option key={s.shipment_id} value={s.shipment_id}>
                        {s.tracking_number} — {s.source} → {s.destination} ({s.customer_name} • {s.status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Vehicle & Driver Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-700 mb-1 block font-semibold">2. Select Vehicle *</label>
                    <select
                      value={form.vehicle_id}
                      onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Available Vehicle --</option>
                      {vehicles
                        .filter((v) => v.status === "Available" || v.vehicle_id === form.vehicle_id)
                        .map((v) => (
                          <option key={v.vehicle_id} value={v.vehicle_id}>
                            {v.registration_number} ({v.brand} {v.model})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-700 mb-1 block font-semibold">3. Select Driver *</label>
                    <select
                      value={form.driver_id}
                      onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Available Driver --</option>
                      {drivers
                        .filter((d) => d.status === "Available" || d.driver_id === form.driver_id)
                        .map((d) => (
                          <option key={d.driver_id} value={d.driver_id}>
                            {d.full_name} ({d.license_number || "Driver"})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* 3. Origin & Destination Cities */}
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                  <div>
                    <label className="text-slate-700 mb-1 block font-semibold">Origin City *</label>
                    <input
                      type="text"
                      placeholder="e.g. Kakinada"
                      value={form.start_city}
                      onChange={(e) => handleCityChange("start", e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                      {form.start_lat && form.start_lng ? `📍 ${Number(form.start_lat).toFixed(4)}, ${Number(form.start_lng).toFixed(4)}` : "Type city name..."}
                    </span>
                  </div>

                  <div>
                    <label className="text-slate-700 mb-1 block font-semibold">Destination City *</label>
                    <input
                      type="text"
                      placeholder="e.g. Vizag"
                      value={form.end_city}
                      onChange={(e) => handleCityChange("end", e.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 font-semibold focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                      {form.end_lat && form.end_lng ? `🏁 ${Number(form.end_lat).toFixed(4)}, ${Number(form.end_lng).toFixed(4)}` : "Type city name..."}
                    </span>
                  </div>
                </div>

                {/* Quick Select Preset Buttons */}
                <div>
                  <p className="text-[11px] text-slate-500 font-semibold mb-1">Quick Select City Preset:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_CITIES.map((cName) => (
                      <button
                        key={cName}
                        type="button"
                        onClick={() => {
                          if (!form.start_city) handleQuickCity(cName, "start");
                          else handleQuickCity(cName, "end");
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-medium transition"
                      >
                        {cName}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calculate Route Trigger */}
                <div>
                  <button
                    type="button"
                    onClick={() => calculateRouteForForm(form)}
                    disabled={calculatingRoute}
                    className="w-full py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <span>⚡ CALCULATE ROUTE OPTIONS</span>
                    {calculatingRoute && <span className="animate-spin">🌀</span>}
                  </button>
                </div>

                {/* Route Options Grid */}
                {modalRouteOptions && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <p className="font-bold text-slate-900 text-xs flex justify-between items-center">
                      <span>🗺️ ROUTE STRATEGY OPTIONS</span>
                      <span className="text-[10px] text-slate-500">Click a card to select</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(modalRouteOptions).map(([type, opt]) => {
                        const isSelected = modalRouteType === type;
                        return (
                          <div
                            key={type}
                            onClick={() => setModalRouteType(type)}
                            className={`p-2.5 rounded-xl border cursor-pointer transition space-y-1 ${
                              isSelected
                                ? "border-blue-600 bg-blue-50 text-blue-900 shadow-xs ring-1 ring-blue-500"
                                : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <p className="font-bold text-[11px] text-slate-900 uppercase">{opt.name}</p>
                              {isSelected && <span className="text-blue-600 text-[10px] font-bold">✔ ACTIVE</span>}
                            </div>
                            <div className="text-[10px] space-y-0.5 font-mono">
                              <p>📏 Distance: <strong className="text-slate-900">{opt.distance} km</strong></p>
                              <p>⏱️ Duration: <strong className="text-slate-900">{formatDuration(opt.duration)}</strong></p>
                              <p>🕒 Est. ETA: <strong className="text-blue-600">{formatETA(opt)}</strong></p>
                              {opt.traffic_delay_mins > 0 ? (
                                <p className="text-amber-600 text-[9px] font-bold">⚠️ +{opt.traffic_delay_mins}m delay</p>
                              ) : (
                                <p className="text-emerald-600 text-[9px] font-bold">✓ Clear</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-sm disabled:opacity-50 transition"
                  >
                    {actionLoading ? "Scheduling..." : "Schedule Trip"}
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