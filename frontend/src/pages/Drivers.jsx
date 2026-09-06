import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import {
  getDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
  assignDriver,
  unassignDriver,
} from "../api/drivers";
import { getVehicles } from "../api/vehicles";

const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  license_number: "",
  license_expiry: "2028-12-31",
  status: "Available",
  password: "driver123",
  assigned_vehicle_id: "",
};

const STATUS_BADGE_STYLES = {
  Available: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold",
  "On Trip": "bg-blue-50 text-blue-700 border border-blue-200 font-semibold",
  Inactive: "bg-rose-50 text-rose-700 border border-rose-200 font-semibold",
  "Off Duty": "bg-slate-100 text-slate-600 border border-slate-200 font-semibold",
};

export default function DriversPage() {
  const { user } = useAuth();
  const rawRole = user?.role;
  const normalizedRole = typeof rawRole === "string"
    ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");
  const canManage = normalizedRole === "admin" || normalizedRole === "fleetmanager";

  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [editingDriver, setEditingDriver] = useState(null);
  const [assigningDriver, setAssigningDriver] = useState(null);
  const [targetVehicleId, setTargetVehicleId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [drvRes, vehRes] = await Promise.all([
        getDrivers(),
        getVehicles().catch(() => ({ data: [] })),
      ]);
      setDrivers(drvRes.data || []);
      setVehicles(vehRes.data || []);
    } catch (err) {
      setError("Failed to load driver data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredDrivers = drivers.filter((d) => {
    const matchesSearch =
      !searchQuery ||
      d.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.license_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.driver_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.assigned_vehicle?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || d.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalDrivers = drivers.length;
  const availableCount = drivers.filter((d) => d.status === "Available").length;
  const onTripCount = drivers.filter((d) => d.status === "On Trip").length;
  const inactiveCount = drivers.filter((d) => d.status === "Inactive" || d.status === "Off Duty").length;

  const availableVehiclesForRegister = vehicles.filter(
    (v) => (!v.assigned_driver_id || v.assigned_driver_id === null) && v.status !== "Maintenance"
  );

  const selectableVehiclesForEdit = vehicles.filter(
    (v) =>
      ((!v.assigned_driver_id || v.assigned_driver_id === null) ||
        v.assigned_driver_id === editingDriver?.driver_id ||
        v.vehicle_id === editingDriver?.assigned_vehicle_id) &&
      v.status !== "Maintenance"
  );

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        assigned_vehicle_id: form.assigned_vehicle_id ? form.assigned_vehicle_id : null,
      };
      await createDriver(payload);
      setShowAddModal(false);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create driver");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingDriver) return;
    setActionLoading(true);
    setError("");
    try {
      const payload = {
        license_number: form.license_number,
        license_expiry: form.license_expiry,
        status: form.status,
        assigned_vehicle_id: form.assigned_vehicle_id ? form.assigned_vehicle_id : "",
      };
      await updateDriver(editingDriver.driver_id, payload);
      setShowEditModal(false);
      setEditingDriver(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update driver");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assigningDriver) return;
    setActionLoading(true);
    setError("");
    try {
      if (targetVehicleId) {
        await assignDriver(assigningDriver.driver_id, targetVehicleId);
      } else {
        await unassignDriver(assigningDriver.driver_id);
      }
      setShowAssignModal(false);
      setAssigningDriver(null);
      setTargetVehicleId("");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to assign vehicle");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (driverId) => {
    setActionLoading(true);
    setError("");
    try {
      await deleteDriver(driverId);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete driver");
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (driver) => {
    setEditingDriver(driver);
    setForm({
      full_name: driver.full_name,
      email: driver.email,
      phone: driver.phone || "",
      license_number: driver.license_number || "",
      license_expiry: driver.license_expiry || "2028-12-31",
      status: driver.status || "Available",
      password: "",
      assigned_vehicle_id: driver.assigned_vehicle_id || "",
    });
    setShowEditModal(true);
  };

  const openDetail = (driver) => {
    setSelectedDriver(driver);
    setShowDetailModal(true);
  };

  const openAssign = (driver) => {
    setAssigningDriver(driver);
    setTargetVehicleId(driver.assigned_vehicle_id || "");
    setShowAssignModal(true);
  };

  const formatDriverId = (id) => {
    if (!id) return "DRV-0000";
    return `DRV-${String(id).slice(0, 6).toUpperCase()}`;
  };

  const operatorName = (user?.full_name || user?.email?.split("@")[0] || "VASU KRISHNA").toUpperCase();
  const operatorRole = (user?.role || "FLEETMANAGER").toUpperCase();

  return (
    <div className="flex min-h-screen bg-white text-slate-900 font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-white">
        {/* Top Header matching reference */}
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Driver Management
            </h1>
            <p className="text-[11px] font-mono font-bold tracking-wider text-blue-600 uppercase mt-0.5">
              REGISTER, ASSIGN & MONITOR DRIVER STATUS AND FLEET VEHICLES
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-mono text-slate-500 font-bold uppercase tracking-wider">
              OPERATOR: <span className="text-slate-800">{operatorName} ({operatorRole})</span>
            </p>
          </div>
        </div>

        {/* 4 Stat Cards matching reference image */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-[11px] font-mono text-slate-500 font-bold uppercase tracking-wider">
              TOTAL DRIVERS
            </p>
            <p className="text-3xl font-black text-slate-900 mt-1">{totalDrivers}</p>
            <p className="text-[9px] font-mono text-slate-400 font-semibold uppercase mt-1">
              REGISTERED FLEET DRIVERS
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-[11px] font-mono text-slate-500 font-bold uppercase tracking-wider">
              AVAILABLE
            </p>
            <p className="text-3xl font-black text-emerald-600 mt-1">{availableCount}</p>
            <p className="text-[9px] font-mono text-slate-400 font-semibold uppercase mt-1">
              READY FOR VEHICLE ASSIGNMENT
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-[11px] font-mono text-slate-500 font-bold uppercase tracking-wider">
              ON TRIP
            </p>
            <p className="text-3xl font-black text-blue-600 mt-1">{onTripCount}</p>
            <p className="text-[9px] font-mono text-slate-400 font-semibold uppercase mt-1">
              IN TRANSIT ON ACTIVE TRIP
            </p>
          </div>

          {/* Card 4 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-[11px] font-mono text-slate-500 font-bold uppercase tracking-wider">
              INACTIVE / OFF DUTY
            </p>
            <p className="text-3xl font-black text-rose-600 mt-1">{inactiveCount}</p>
            <p className="text-[9px] font-mono text-slate-400 font-semibold uppercase mt-1">
              OFF DUTY OR UNASSIGNABLE
            </p>
          </div>
        </div>

        {/* Search & Filter Bar with + Register Driver button */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[300px]">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by name, email, phone, license..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="All">All Statuses ▾</option>
              <option value="Available">Available</option>
              <option value="On Trip">On Trip</option>
              <option value="Inactive">Inactive</option>
              <option value="Off Duty">Off Duty</option>
            </select>
          </div>

          {canManage && (
            <button
              onClick={() => {
                setForm(emptyForm);
                setShowAddModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 shadow-sm transition flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Register Driver</span>
            </button>
          )}
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Driver Management Data Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-mono text-[11px]">
                <tr>
                  <th className="p-4 font-semibold">DRIVER ID</th>
                  <th className="p-4 font-semibold">DRIVER NAME</th>
                  <th className="p-4 font-semibold">CONTACT</th>
                  <th className="p-4 font-semibold">LICENSE NO.</th>
                  <th className="p-4 font-semibold">LICENSE EXPIRY</th>
                  <th className="p-4 font-semibold">STATUS</th>
                  <th className="p-4 font-semibold">ASSIGNED VEHICLE</th>
                  <th className="p-4 font-semibold">CURRENT TRIP</th>
                  <th className="p-4 font-semibold text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400 font-mono">
                      <span className="animate-spin inline-block mr-2">🔄</span> Loading drivers...
                    </td>
                  </tr>
                ) : filteredDrivers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400 font-mono">
                      No drivers found.
                    </td>
                  </tr>
                ) : (
                  filteredDrivers.map((d) => {
                    const hasVehicle = d.assigned_vehicle && d.assigned_vehicle !== "None";
                    const hasTrip = d.current_trip && d.current_trip !== "None";

                    return (
                      <tr key={d.driver_id} className="hover:bg-slate-50/80 transition">
                        {/* Driver ID */}
                        <td className="p-4 font-mono font-bold text-blue-600 text-xs">
                          {formatDriverId(d.driver_id)}
                        </td>

                        {/* Driver Name */}
                        <td className="p-4 font-bold text-slate-900 text-xs">
                          {d.full_name}
                        </td>

                        {/* Contact (Phone top, Email bottom) */}
                        <td className="p-4">
                          <p className="font-mono text-slate-800 font-medium">{d.phone || "—"}</p>
                          <p className="font-mono text-[10px] text-slate-400 mt-0.5">{d.email}</p>
                        </td>

                        {/* License No */}
                        <td className="p-4 font-mono text-slate-700 font-medium">
                          {d.license_number || "—"}
                        </td>

                        {/* License Expiry */}
                        <td className="p-4 font-mono text-slate-500">
                          {d.license_expiry || "2028-12-31"}
                        </td>

                        {/* Status Badge */}
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] uppercase font-mono ${
                              STATUS_BADGE_STYLES[d.status] || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {d.status || "Available"}
                          </span>
                        </td>

                        {/* Assigned Vehicle */}
                        <td className="p-4">
                          {hasVehicle ? (
                            <div>
                              <p className="font-mono font-bold text-blue-600 text-xs">{d.assigned_vehicle}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{d.assigned_vehicle_model || ""}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">None</span>
                          )}
                        </td>

                        {/* Current Trip */}
                        <td className="p-4 font-mono text-xs">
                          {hasTrip ? (
                            <span className="text-blue-600 font-medium">
                              {d.current_trip}
                            </span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => openDetail(d)}
                            className="text-slate-600 hover:text-slate-900 font-medium text-xs transition"
                          >
                            View
                          </button>

                          {canManage && (
                            <>
                              <button
                                onClick={() => openAssign(d)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition"
                              >
                                Assign/Reassign
                              </button>

                              <button
                                onClick={() => openEdit(d)}
                                className="text-slate-600 hover:text-blue-600 font-medium text-xs transition"
                              >
                                Edit
                              </button>

                              <button
                                onClick={() => setDeleteConfirm(d)}
                                className="text-rose-500 hover:text-rose-700 font-medium text-xs transition"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Register New Driver */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 text-slate-900">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Register New Driver</h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Full Name *</label>
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    placeholder="Driver full name"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    placeholder="driver@company.com"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phone Number</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    placeholder="9876543210"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">License Number</label>
                    <input
                      value={form.license_number}
                      onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
                      placeholder="DL-12345"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">License Expiry</label>
                    <input
                      type="date"
                      value={form.license_expiry}
                      onChange={(e) => setForm({ ...form, license_expiry: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Default Password *</label>
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Assigned Vehicle *
                  </label>
                  <select
                    required={availableVehiclesForRegister.length > 0}
                    value={form.assigned_vehicle_id}
                    onChange={(e) => setForm({ ...form, assigned_vehicle_id: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-mono text-xs"
                    disabled={availableVehiclesForRegister.length === 0}
                  >
                    {availableVehiclesForRegister.length === 0 ? (
                      <option value="">No available vehicles</option>
                    ) : (
                      <>
                        <option value="">Select Vehicle ▼</option>
                        {availableVehiclesForRegister.map((v) => (
                          <option key={v.vehicle_id} value={v.vehicle_id}>
                            {v.registration_number} — {v.brand} {v.model} — {v.vehicle_type} ({v.status})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                  >
                    {actionLoading ? "Saving..." : "Register Driver"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Driver Profile */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 text-slate-900">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Update Driver Profile</h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">License Number</label>
                  <input
                    value={form.license_number}
                    onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">License Expiry</label>
                  <input
                    type="date"
                    value={form.license_expiry}
                    onChange={(e) => setForm({ ...form, license_expiry: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Available">Available</option>
                    <option value="On Trip">On Trip</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Off Duty">Off Duty</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Assigned Vehicle
                  </label>
                  <select
                    value={form.assigned_vehicle_id || ""}
                    onChange={(e) => setForm({ ...form, assigned_vehicle_id: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-mono text-xs"
                  >
                    <option value="">-- No Vehicle (Unassign) --</option>
                    {selectableVehiclesForEdit.map((v) => (
                      <option key={v.vehicle_id} value={v.vehicle_id}>
                        {v.registration_number} — {v.brand} {v.model} — {v.vehicle_type} ({v.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                  >
                    {actionLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Assign / Reassign Vehicle */}
        {showAssignModal && assigningDriver && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 text-slate-900">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Assign Vehicle to {assigningDriver.full_name}</h3>
                <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleAssignSubmit} className="space-y-4 text-xs">
                <div>
                  <p className="text-slate-600 mb-2">
                    Current Assigned Vehicle: <strong className="text-blue-600">{assigningDriver.assigned_vehicle || "None"}</strong>
                  </p>

                  <label className="block text-slate-700 font-semibold mb-1">
                    Select Vehicle to Assign
                  </label>
                  <select
                    value={targetVehicleId}
                    onChange={(e) => setTargetVehicleId(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- No Vehicle (Unassign) --</option>
                    {vehicles.map((v) => (
                      <option key={v.vehicle_id} value={v.vehicle_id}>
                        {v.registration_number} ({v.brand} {v.model}) — Status: {v.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                  >
                    {actionLoading ? "Saving..." : "Confirm Assignment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Detail View */}
        {showDetailModal && selectedDriver && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4 text-xs text-slate-900">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">{selectedDriver.full_name}</h3>
                <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-mono">Driver ID:</span>
                  <span className="text-blue-600 font-mono font-bold">{formatDriverId(selectedDriver.driver_id)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-mono">Email:</span>
                  <span className="text-slate-900 font-medium">{selectedDriver.email}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-mono">Phone:</span>
                  <span className="text-slate-700 font-mono">{selectedDriver.phone || "—"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-mono">License Number:</span>
                  <span className="text-blue-600 font-mono font-medium">{selectedDriver.license_number || "—"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-mono">License Expiry:</span>
                  <span className="text-slate-700 font-mono">{selectedDriver.license_expiry || "—"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-mono">Assigned Vehicle:</span>
                  <span className="text-blue-600 font-mono font-semibold">{selectedDriver.assigned_vehicle || "None"}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500 font-mono">Current Status:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${STATUS_BADGE_STYLES[selectedDriver.status] || "bg-slate-100 text-slate-600"}`}>
                    {selectedDriver.status}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Delete Confirmation */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-xl space-y-4 text-slate-900">
              <h3 className="text-base font-bold text-slate-900">Delete Driver Profile?</h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to delete profile for <strong className="text-slate-900">{deleteConfirm.full_name || deleteConfirm.license_number || "this driver"}</strong>?
              </p>
              {error && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                  ⚠️ {error}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setDeleteConfirm(null);
                    setError("");
                  }}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl hover:bg-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.driver_id)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 disabled:opacity-50 shadow-sm"
                >
                  {actionLoading ? "Deleting..." : "Delete Driver"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
