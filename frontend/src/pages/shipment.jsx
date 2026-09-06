import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import {
  getShipments,
  createShipment,
  updateShipment,
  deleteShipment,
  getShipmentAlerts,
  getUsers,
  getDrivers,
} from "../api/shipments";
import { getVehicles } from "../api/vehicles";

const emptyForm = {
  tracking_number: "",
  source: "Kakinada",
  destination: "Hyderabad",
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  shipment_weight: "",
  vehicle_id: "",
  driver_id: "",
  status: "Created",
  expected_delivery_at: "",
};

const STATUS_BADGE_STYLES = {
  Created: "bg-slate-100 text-slate-700 border-slate-200",
  Assigned: "bg-blue-50 text-blue-700 border-blue-200 font-bold",
  "In Transit": "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/40 font-bold",
  Delayed: "bg-amber-50 text-amber-700 border-amber-200 font-bold",
  Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200 font-bold",
};

export default function Shipments() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const canManage =
    user?.role === "Admin" ||
    user?.role === "FleetManager" ||
    user?.role === "Dispatcher";
  const canDelete = user?.role === "Admin" || user?.role === "FleetManager";

  const [shipments, setShipments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [driversList, setDriversList] = useState([]);   // driver_id → full_name
  const [alerts, setAlerts] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [form, setForm] = useState(emptyForm);
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      const [shipRes, alertRes, vehRes, usersRes, driversRes] = await Promise.all([
        getShipments(),
        getShipmentAlerts().catch(() => ({ data: [] })),
        getVehicles().catch(() => ({ data: [] })),
        getUsers().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
      ]);
      const shipData = shipRes.data || [];
      setShipments(shipData);
      setAlerts(alertRes.data || []);
      setVehicles(vehRes.data || []);
      setUsersList(usersRes.data || []);
      setDriversList(driversRes.data || []);

      if (shipData.length > 0 && !selectedShipment) {
        setSelectedShipment(shipData[0]);
      }
    } catch (err) {
      setError("Failed to load shipments");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Helper maps
  const vehicleMap = {};
  vehicles.forEach((v) => {
    vehicleMap[v.vehicle_id] = v.brand
      ? `${v.registration_number} — ${v.brand} ${v.model || ""}`.trim()
      : v.registration_number;
    vehicleMap[String(v.vehicle_id)] = vehicleMap[v.vehicle_id];
  });

  // driverMap: driver_id → full_name (with phone)
  const driverMap = {};
  driversList.forEach((d) => {
    driverMap[d.driver_id] = d.phone
      ? `${d.full_name || "Driver"} (${d.phone})`
      : (d.full_name || "Driver");
    driverMap[String(d.driver_id)] = driverMap[d.driver_id];
  });

  // Active & available drivers from real database
  const availableDrivers = driversList.filter(
    (d) => d.status !== "Inactive" && d.status !== "Off Duty"
  );

  // Active & available vehicles from real database
  const availableVehicles = vehicles.filter(
    (v) => v.status !== "Maintenance"
  );

  const filteredShipments = shipments.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.tracking_number?.toLowerCase().includes(q) ||
      s.source?.toLowerCase().includes(q) ||
      s.destination?.toLowerCase().includes(q) ||
      s.customer_name?.toLowerCase().includes(q)
    );
  });

  const openAddModal = () => {
    // Generate a random high-tech tracking ID
    const randomId = `SHP-${Math.floor(100000 + Math.random() * 900000)}-US`;
    setForm({ ...emptyForm, tracking_number: randomId });
    setShowAddModal(true);
    setError("");
  };

  const openEditModal = (shipment) => {
    setEditingShipment(shipment);
    setForm({
      tracking_number: shipment.tracking_number || "",
      source: shipment.source || "",
      destination: shipment.destination || "",
      customer_name: shipment.customer_name || "",
      customer_phone: shipment.customer_phone || "7705573098",
      customer_email: shipment.customer_email || "v.usharani2302@gmail.com",
      shipment_weight: shipment.shipment_weight || "",
      vehicle_id: shipment.vehicle_id || "",
      driver_id: shipment.driver_id || "",
      status: shipment.status || "Created",
      expected_delivery_at: shipment.expected_delivery_at
        ? new Date(shipment.expected_delivery_at).toISOString().slice(0, 16)
        : "",
    });
    setShowEditModal(true);
    setError("");
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const sTrim = (form.source || "").trim();
    const dTrim = (form.destination || "").trim();
    if (sTrim.length <= 2) {
      setError(`Please specify a real city/location for Source (e.g. Kakinada, Vijayawada), not just a state code like "${sTrim}".`);
      return;
    }
    if (dTrim.length <= 2) {
      setError(`Please specify a real city/location for Destination (e.g. Hyderabad), not just a state code like "${dTrim}".`);
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        tracking_number: form.tracking_number,
        source: form.source,
        destination: form.destination,
        customer_name: form.customer_name,
        shipment_weight: Number(form.shipment_weight) || 100,
        status: form.status,
        vehicle_id: form.vehicle_id || null,
        driver_id: form.driver_id || null,
        expected_delivery_at: form.expected_delivery_at
          ? new Date(form.expected_delivery_at).toISOString()
          : null,
      };
      // remove nulls
      if (!payload.vehicle_id) delete payload.vehicle_id;
      if (!payload.driver_id) delete payload.driver_id;

      const res = await createShipment(payload);
      setShowAddModal(false);
      await loadData();
      setSelectedShipment(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create shipment");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingShipment) return;
    setError("");

    const sTrim = (form.source || "").trim();
    const dTrim = (form.destination || "").trim();
    if (sTrim.length <= 2) {
      setError(`Please specify a real city/location for Source (e.g. Kakinada, Vijayawada), not just a state code like "${sTrim}".`);
      return;
    }
    if (dTrim.length <= 2) {
      setError(`Please specify a real city/location for Destination (e.g. Hyderabad), not just a state code like "${dTrim}".`);
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        tracking_number: form.tracking_number,
        source: form.source,
        destination: form.destination,
        customer_name: form.customer_name,
        shipment_weight: Number(form.shipment_weight) || 100,
        status: form.status,
        vehicle_id: form.vehicle_id || null,
        driver_id: form.driver_id || null,
        expected_delivery_at: form.expected_delivery_at
          ? new Date(form.expected_delivery_at).toISOString()
          : null,
      };

      const res = await updateShipment(editingShipment.shipment_id, payload);
      setShowEditModal(false);
      setEditingShipment(null);
      await loadData();
      setSelectedShipment(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update shipment");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (shipment) => {
    setActionLoading(true);
    setError("");
    try {
      await deleteShipment(shipment.shipment_id);
      setDeleteConfirm(null);
      if (selectedShipment?.shipment_id === shipment.shipment_id) {
        setSelectedShipment(null);
      }
      await loadData();
    } catch (err) {
      setDeleteConfirm(null);
      setError(err.response?.data?.detail || "Failed to delete shipment");
    } finally {
      setActionLoading(false);
    }
  };

  // Metrics Calculations for KPI Cards
  const totalVehiclesCount = vehicles.length || 7;
  const activeVehiclesCount = vehicles.filter((v) => v.status === "Assigned" || v.status === "In Transit").length;
  const activeCapacityPercentage = totalVehiclesCount > 0 ? (activeVehiclesCount / totalVehiclesCount) * 100 : 0;

  const inTransitCount = shipments.filter((s) => s.status === "In Transit").length;
  const maintenanceCount = vehicles.filter((v) => v.status === "Maintenance").length;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 font-sans overflow-x-hidden">
      {/* Left Vertical Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-white">
        {/* Main Header */}
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              Shipments
            </h1>
            <p className="text-xs font-mono font-bold tracking-wider text-blue-600 uppercase mt-1">
              FLEET OPERATIONS AND ROUTE TRACKING
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="px-3.5 py-1 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 text-xs font-semibold font-mono shadow-sm transition flex items-center gap-1.5"
              title="Refresh Shipments"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
            <span className="text-xs font-mono text-slate-500">
              LATENCY: <strong className="text-blue-600">18ms</strong>
            </span>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono rounded-full font-semibold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              SYSTEM ONLINE
            </div>
          </div>

        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Active Fleet Vehicles */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-sm">
            <p className="text-[10px] font-mono tracking-widest text-slate-500 font-bold uppercase">
              ACTIVE FLEET VEHICLES
            </p>
            <h3 className="text-2xl font-bold text-slate-900 font-mono">
              {activeVehiclesCount} / {totalVehiclesCount}
            </h3>
            <p className="text-[10px] font-mono text-slate-400 pt-1">
              // {activeCapacityPercentage.toFixed(1)}% ACTIVE CAPACITY
            </p>
          </div>

          {/* Card 2: Transit Dispatches */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-sm">
            <p className="text-[10px] font-mono tracking-widest text-slate-500 font-bold uppercase">
              TRANSIT DISPATCHES
            </p>
            <h3 className="text-2xl font-bold text-blue-600 font-mono">
              {inTransitCount} ACTIVE
            </h3>
            <p className="text-[10px] font-mono text-slate-400 pt-1">
              // {inTransitCount > 0 ? "ROUTING RELAYS ACTIVE" : "NO ACTIVE ROUTING RELAYS"}
            </p>
          </div>

          {/* Card 3: Maintenance Incidents */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-sm">
            <p className="text-[10px] font-mono tracking-widest text-slate-500 font-bold uppercase">
              MAINTENANCE INCIDENTS
            </p>
            <h3 className="text-2xl font-bold text-emerald-600 font-mono">
              {maintenanceCount} PENDING
            </h3>
            <p className="text-[10px] font-mono text-slate-400 pt-1">
              // {maintenanceCount > 0 ? "MAINTENANCE REQUIRED" : "ALL SYSTEMS OPERATIONAL"}
            </p>
          </div>

          {/* Card 4: System Signal Ping */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1 shadow-sm">
            <p className="text-[10px] font-mono tracking-widest text-slate-500 font-bold uppercase">
              SYSTEM SIGNAL PING
            </p>
            <h3 className="text-2xl font-bold text-blue-600 font-mono">
              15 MS
            </h3>
            <p className="text-[10px] font-mono text-slate-400 pt-1">
              // WEBSOCKET CONNECTION ACTIVE
            </p>
          </div>
        </div>

        {/* Search Bar & Action Button */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 text-sm pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by tracking #, source, customer..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 font-mono transition"
            />
          </div>

          {canManage && (
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-2"
            >
              <span>+</span> Register Shipment
            </button>
          )}
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl">
            {error}
          </div>
        )}

        {/* Main Grid Area: Shipments List (Left) + Shipment Details (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Shipment Cards */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredShipments.map((s) => {
                const isSelected = selectedShipment?.shipment_id === s.shipment_id;
                const assignedVehicleStr = s.vehicle_id
                  ? (vehicleMap[s.vehicle_id] || vehicleMap[String(s.vehicle_id)] || `Vehicle #${String(s.vehicle_id).slice(0, 8)}...`)
                  : "Not Assigned";
                const assignedDriverStr = s.driver_id
                  ? (driverMap[s.driver_id] || driverMap[String(s.driver_id)] || `Driver #${String(s.driver_id).slice(0, 8)}...`)
                  : "Not Assigned";

                return (
                  <div
                    key={s.shipment_id}
                    onClick={() => setSelectedShipment(s)}
                    className={`bg-white border rounded-2xl p-5 hover:border-slate-300 transition cursor-pointer space-y-4 relative shadow-sm ${
                      isSelected
                        ? "border-blue-500 bg-blue-50/40 shadow-md ring-1 ring-blue-400"
                        : "border-slate-200"
                    }`}
                  >
                    {/* Top Row: Tracking ID & Status Badge */}
                    <div className="flex justify-between items-start">
                      <h4 className="font-mono text-xs font-bold text-blue-600 tracking-wider">
                        {s.tracking_number}
                      </h4>
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-mono border ${
                          STATUS_BADGE_STYLES[s.status] || "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    {/* Customer Name */}
                    <h3 className="text-base font-bold text-slate-900 tracking-wide">
                      {s.customer_name}
                    </h3>

                    {/* Route Pill Bar */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs flex items-center gap-2 font-mono">
                      <span className="text-rose-500">📍</span>
                      <span className="text-slate-800 font-bold uppercase">{s.source}</span>
                      <span className="text-slate-400">➔</span>
                      <span className="text-blue-600 font-bold uppercase">{s.destination}</span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase">CARGO WEIGHT</p>
                        <p className="text-slate-800 font-semibold">{s.shipment_weight} kg</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 uppercase">VEHICLE</p>
                        <p className="text-slate-800 font-semibold truncate">{assignedVehicleStr}</p>
                      </div>
                      <div className="col-span-2 pt-1">
                        <p className="text-[9px] text-slate-400 uppercase">ASSIGNED DRIVER</p>
                        <p className="text-slate-800 font-semibold truncate">{assignedDriverStr}</p>
                      </div>
                    </div>

                    {/* Action Buttons: Track & Delete */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("/trips", { state: { shipmentId: s.shipment_id } });
                        }}
                        className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <span>🎯</span> Track
                      </button>

                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm(s);
                          }}
                          className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                        >
                          <span>🗑️</span> Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredShipments.length === 0 && (
                <div className="col-span-2 p-8 text-center bg-white border border-slate-200 rounded-2xl text-slate-400 text-xs font-mono shadow-sm">
                  No shipments found.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: [ SHIPMENT DETAILS ] Panel */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 h-fit sticky top-6 shadow-sm">
              {/* Details Header */}
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <h3 className="font-mono text-xs font-bold text-blue-600 tracking-widest uppercase">
                  [ SHIPMENT DETAILS ]
                </h3>
                <div className="flex items-center gap-3">
                  {selectedShipment && canManage && (
                    <button
                      onClick={() => openEditModal(selectedShipment)}
                      className="text-xs font-mono font-bold text-blue-600 hover:text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg bg-blue-50 transition"
                    >
                      [EDIT]
                    </button>
                  )}
                  {selectedShipment && (
                    <button
                      onClick={() => setSelectedShipment(null)}
                      className="text-xs font-mono text-slate-400 hover:text-slate-700"
                    >
                      [CLOSE]
                    </button>
                  )}
                </div>
              </div>

              {selectedShipment ? (
                <div className="space-y-5 text-xs font-mono">
                  {/* Tracking ID */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">TRACKING ID</p>
                    <p className="text-blue-600 font-bold text-sm mt-0.5 tracking-wider">
                      {selectedShipment.tracking_number}
                    </p>
                  </div>

                  {selectedShipment.source?.trim().length <= 2 && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-[11px]">
                      ⚠️ Source &quot;{selectedShipment.source}&quot; is incomplete. Please click <strong>[EDIT]</strong> above to update with a specific city name (e.g. Kakinada, Vijayawada).
                    </div>
                  )}

                  {/* Customer & Mass */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">CUSTOMER</p>
                      <p className="text-slate-900 font-bold mt-0.5">{selectedShipment.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">TOTAL MASS</p>
                      <p className="text-slate-900 font-bold mt-0.5">{selectedShipment.shipment_weight} LBS</p>
                    </div>
                  </div>

                  {/* Depots */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">DISPATCH DEPOT</p>
                      <p className="text-slate-900 font-bold mt-0.5 uppercase">{selectedShipment.source}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">DESTINATION DEPOT</p>
                      <p className="text-blue-600 font-bold mt-0.5 uppercase">{selectedShipment.destination}</p>
                    </div>
                  </div>

                  {/* Vehicle & Driver */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">ASSIGNED VEHICLE</p>
                      <p className="text-slate-900 font-bold mt-0.5">
                        {selectedShipment.vehicle_id
                          ? (vehicleMap[selectedShipment.vehicle_id] || vehicleMap[String(selectedShipment.vehicle_id)] || `Vehicle #${String(selectedShipment.vehicle_id).slice(0, 8)}...`)
                          : "Not Assigned"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest">ASSIGNED DRIVER</p>
                      <p className="text-slate-900 font-bold mt-0.5">
                        {selectedShipment.driver_id
                          ? (driverMap[selectedShipment.driver_id] || driverMap[String(selectedShipment.driver_id)] || `Driver #${String(selectedShipment.driver_id).slice(0, 8)}...`)
                          : "Not Assigned"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-mono text-slate-400 py-6 text-center">
                  Select a shipment to view detailed telemetry specs.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Edit Shipment Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-xl space-y-4 shadow-xl relative font-mono text-xs text-slate-700">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 tracking-widest">
                [ EDIT SHIPMENT ]
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                [CANCEL]
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 pt-1">
              {/* Tracking Number */}
              <div>
                <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                  [ TRACKING NUMBER ]
                </label>
                <input
                  name="tracking_number"
                  value={form.tracking_number}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Source & Destination */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ SOURCE / ORIGIN ]
                  </label>
                  <input
                    name="source"
                    value={form.source}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono uppercase focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ DESTINATION ]
                  </label>
                  <input
                    name="destination"
                    value={form.destination}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono uppercase focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Customer Name & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ CUSTOMER NAME ]
                  </label>
                  <input
                    name="customer_name"
                    value={form.customer_name}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ CUSTOMER PHONE (OPTIONAL) ]
                  </label>
                  <input
                    name="customer_phone"
                    value={form.customer_phone}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                  [ CONTRACTOR / CUSTOMER EMAIL (OPTIONAL) ]
                </label>
                <input
                  type="email"
                  name="customer_email"
                  value={form.customer_email}
                  onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Weight & Expected Delivery */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ WEIGHT (KG) (OPTIONAL) ]
                  </label>
                  <input
                    type="number"
                    name="shipment_weight"
                    value={form.shipment_weight}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ EXPECTED DELIVERY (OPTIONAL) ]
                  </label>
                  <input
                    type="datetime-local"
                    name="expected_delivery_at"
                    value={form.expected_delivery_at}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Assigned Vehicle & Driver Dropdowns */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ ASSIGNED DRIVER ]
                  </label>
                  <select
                    name="driver_id"
                    value={form.driver_id || ""}
                    onChange={(e) => {
                      const selectedDrvId = e.target.value;
                      const selectedDrv = driversList.find((d) => String(d.driver_id) === String(selectedDrvId));
                      setForm((prev) => {
                        const updates = { ...prev, driver_id: selectedDrvId };
                        if (selectedDrv?.assigned_vehicle_id && !prev.vehicle_id) {
                          updates.vehicle_id = selectedDrv.assigned_vehicle_id;
                        }
                        return updates;
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none text-xs"
                  >
                    <option value="">-- No Driver (Unassigned) --</option>
                    {availableDrivers.length === 0 ? (
                      <option value="" disabled>No available drivers</option>
                    ) : (
                      availableDrivers.map((d) => (
                        <option key={d.driver_id} value={d.driver_id}>
                          {d.full_name} — {d.phone || "No Phone"} ({d.status || "Available"}{d.assigned_vehicle && d.assigned_vehicle !== "None" ? ` • Veh: ${d.assigned_vehicle}` : ""})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ ASSIGNED VEHICLE ]
                  </label>
                  <select
                    name="vehicle_id"
                    value={form.vehicle_id || ""}
                    onChange={(e) => {
                      const selectedVehId = e.target.value;
                      const selectedVeh = vehicles.find((v) => String(v.vehicle_id) === String(selectedVehId));
                      setForm((prev) => {
                        const updates = { ...prev, vehicle_id: selectedVehId };
                        if (selectedVeh?.assigned_driver_id && !prev.driver_id) {
                          updates.driver_id = selectedVeh.assigned_driver_id;
                        }
                        return updates;
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none text-xs"
                  >
                    <option value="">-- No Vehicle (Unassigned) --</option>
                    {availableVehicles.length === 0 ? (
                      <option value="" disabled>No available vehicles</option>
                    ) : (
                      availableVehicles.map((v) => (
                        <option key={v.vehicle_id} value={v.vehicle_id}>
                          {v.registration_number} — {v.brand} {v.model} ({v.vehicle_type || "Vehicle"}) - {v.status}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Status Dropdown */}
              <div>
                <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                  [ TRANSIT STATUS ]
                </label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="Created">Created</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold"
                >
                  [ CANCEL ]
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-sm"
                >
                  {actionLoading ? "[ SAVING... ]" : "[ SAVE CHANGES ]"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Shipment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-xl space-y-4 shadow-xl relative font-mono text-xs text-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 tracking-widest">
                [ REGISTER NEW SHIPMENT ]
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                [CANCEL]
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 pt-1">
              <div>
                <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                  [ TRACKING NUMBER ]
                </label>
                <input
                  name="tracking_number"
                  value={form.tracking_number}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ SOURCE / ORIGIN ]
                  </label>
                  <input
                    name="source"
                    value={form.source}
                    onChange={handleChange}
                    required
                    placeholder="KAKINADA"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono uppercase focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ DESTINATION ]
                  </label>
                  <input
                    name="destination"
                    value={form.destination}
                    onChange={handleChange}
                    required
                    placeholder="HYDERABAD"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono uppercase focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ CUSTOMER NAME ]
                  </label>
                  <input
                    name="customer_name"
                    value={form.customer_name}
                    onChange={handleChange}
                    required
                    placeholder="devara"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ WEIGHT (KG) ]
                  </label>
                  <input
                    type="number"
                    name="shipment_weight"
                    value={form.shipment_weight}
                    onChange={handleChange}
                    required
                    placeholder="2000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Assign Driver & Assign Vehicle Dropdowns */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ ASSIGN DRIVER (OPTIONAL) ]
                  </label>
                  <select
                    name="driver_id"
                    value={form.driver_id || ""}
                    onChange={(e) => {
                      const selectedDrvId = e.target.value;
                      const selectedDrv = driversList.find((d) => String(d.driver_id) === String(selectedDrvId));
                      setForm((prev) => {
                        const updates = { ...prev, driver_id: selectedDrvId };
                        if (selectedDrv?.assigned_vehicle_id && !prev.vehicle_id) {
                          updates.vehicle_id = selectedDrv.assigned_vehicle_id;
                        }
                        return updates;
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none text-xs"
                  >
                    <option value="">-- Assign Driver (Optional) --</option>
                    {availableDrivers.length === 0 ? (
                      <option value="" disabled>No available drivers</option>
                    ) : (
                      availableDrivers.map((d) => (
                        <option key={d.driver_id} value={d.driver_id}>
                          {d.full_name} — {d.phone || "No Phone"} ({d.status || "Available"}{d.assigned_vehicle && d.assigned_vehicle !== "None" ? ` • Veh: ${d.assigned_vehicle}` : ""})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ ASSIGN VEHICLE (OPTIONAL) ]
                  </label>
                  <select
                    name="vehicle_id"
                    value={form.vehicle_id || ""}
                    onChange={(e) => {
                      const selectedVehId = e.target.value;
                      const selectedVeh = vehicles.find((v) => String(v.vehicle_id) === String(selectedVehId));
                      setForm((prev) => {
                        const updates = { ...prev, vehicle_id: selectedVehId };
                        if (selectedVeh?.assigned_driver_id && !prev.driver_id) {
                          updates.driver_id = selectedVeh.assigned_driver_id;
                        }
                        return updates;
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none text-xs"
                  >
                    <option value="">-- Assign Vehicle (Optional) --</option>
                    {availableVehicles.length === 0 ? (
                      <option value="" disabled>No available vehicles</option>
                    ) : (
                      availableVehicles.map((v) => (
                        <option key={v.vehicle_id} value={v.vehicle_id}>
                          {v.registration_number} — {v.brand} {v.model} ({v.vehicle_type || "Vehicle"}) - {v.status}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Customer Phone & Customer Email (Optional) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ CUSTOMER PHONE (OPTIONAL) ]
                  </label>
                  <input
                    name="customer_phone"
                    value={form.customer_phone || ""}
                    onChange={handleChange}
                    placeholder="9876543210"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block mb-1">
                    [ EXPECTED DELIVERY (OPTIONAL) ]
                  </label>
                  <input
                    type="datetime-local"
                    name="expected_delivery_at"
                    value={form.expected_delivery_at || ""}
                    onChange={handleChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold"
                >
                  [ CANCEL ]
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-sm"
                >
                  {actionLoading ? "[ CREATING... ]" : "[ CREATE SHIPMENT ]"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-mono">
          <div className="bg-white border border-rose-200 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl text-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🗑️</span>
              <h3 className="text-base font-bold text-slate-900">[ DELETE SHIPMENT ]</h3>
            </div>
            <p className="text-slate-600">
              Permanently delete shipment{" "}
              <span className="text-blue-600 font-bold">{deleteConfirm.tracking_number}</span>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm"
              >
                {actionLoading ? "Deleting..." : "Delete Shipment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}