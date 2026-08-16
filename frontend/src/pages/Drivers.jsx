import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { getDrivers, createDriver, updateDriver, deleteDriver } from "../api/drivers";

const emptyForm = {
  full_name: "",
  email: "",
  phone: "",
  license_number: "",
  license_expiry: "",
  status: "Available",
  password: "driver123",
};

const STATUS_BADGE_STYLES = {
  Available: "bg-emerald-950/80 text-emerald-300 border-emerald-700 font-bold",
  "On Trip": "bg-purple-950/80 text-purple-300 border-purple-700 font-bold animate-pulse",
  Inactive: "bg-rose-950/80 text-rose-300 border-rose-700 font-bold",
};

export default function DriversPage() {
  const { user } = useAuth();
  const canManage =
    user?.role === "Admin" ||
    user?.role === "FleetManager";

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [editingDriver, setEditingDriver] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await getDrivers();
      setDrivers(res.data || []);
    } catch (err) {
      setError("Failed to load drivers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered drivers
  const filteredDrivers = drivers.filter((d) => {
    const matchesSearch =
      !searchQuery ||
      d.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.license_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "All" || d.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Metrics
  const totalDrivers = drivers.length;
  const availableCount = drivers.filter((d) => d.status === "Available").length;
  const onTripCount = drivers.filter((d) => d.status === "On Trip").length;
  const inactiveCount = drivers.filter((d) => d.status === "Inactive").length;

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError("");
    try {
      await createDriver(form);
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
      await updateDriver(editingDriver.driver_id, form);
      setShowEditModal(false);
      setEditingDriver(null);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update driver");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (driverId) => {
    setActionLoading(true);
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

  const openEdit = (d) => {
    setEditingDriver(d);
    setForm({
      full_name: d.full_name || "",
      email: d.email || "",
      phone: d.phone || "",
      license_number: d.license_number || "",
      license_expiry: d.license_expiry || "",
      status: d.status || "Available",
      password: "",
    });
    setShowEditModal(true);
  };

  return (
    <div className="flex min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Drivers</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase mt-1">
              MANAGE DRIVERS, ASSIGNMENTS AND DRIVER STATUS
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-400/80">
              OPERATOR: <strong className="text-cyan-300">{user?.full_name?.toUpperCase()} ({user?.role?.toUpperCase()})</strong>
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* 4 Summary Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5">👤</div>
            <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">TOTAL DRIVERS</p>
            <h3 className="text-3xl font-extrabold text-white mt-1">{totalDrivers}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">REGISTERED DRIVERS</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-emerald-500">✅</div>
            <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider">AVAILABLE</p>
            <h3 className="text-3xl font-extrabold text-emerald-400 mt-1">{availableCount}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">READY FOR ASSIGNMENT</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-purple-500">🚚</div>
            <p className="text-[10px] text-purple-400 font-mono font-bold uppercase tracking-wider">ON TRIP</p>
            <h3 className="text-3xl font-extrabold text-purple-300 mt-1">{onTripCount}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">IN TRANSIT</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-rose-500">⚠️</div>
            <p className="text-[10px] text-rose-400 font-mono font-bold uppercase tracking-wider">INACTIVE</p>
            <h3 className="text-3xl font-extrabold text-rose-400 mt-1">{inactiveCount}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">OFF DUTY / LEAVE</p>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <input
              type="text"
              placeholder="Search by name, email, phone, license..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-full sm:w-72"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="All">All Statuses</option>
              <option value="Available">Available</option>
              <option value="On Trip">On Trip</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {canManage && (
            <button
              onClick={() => {
                setForm(emptyForm);
                setShowAddModal(true);
              }}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2"
            >
              <span>+ Add Driver</span>
            </button>
          )}
        </div>

        {/* Drivers Table / Cards View */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 font-mono text-sm">Loading Drivers...</div>
        ) : filteredDrivers.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500 text-sm font-mono">
            No drivers found matching your criteria.
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                    <th className="p-4">DRIVER ID</th>
                    <th className="p-4">DRIVER NAME</th>
                    <th className="p-4">CONTACT</th>
                    <th className="p-4">LICENSE NO.</th>
                    <th className="p-4">LICENSE EXPIRY</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4">ASSIGNED VEHICLE</th>
                    <th className="p-4">CURRENT TRIP</th>
                    <th className="p-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredDrivers.map((d) => (
                    <tr key={d.driver_id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4 font-mono text-cyan-400 font-semibold">
                        DRV-{d.driver_id.slice(0, 6).toUpperCase()}
                      </td>
                      <td className="p-4 font-bold text-white">
                        {d.full_name}
                      </td>
                      <td className="p-4 text-slate-300">
                        <p>{d.phone}</p>
                        <p className="text-[10px] text-slate-500">{d.email}</p>
                      </td>
                      <td className="p-4 font-mono text-slate-300">
                        {d.license_number}
                      </td>
                      <td className="p-4 font-mono text-slate-400">
                        {d.license_expiry}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] border ${STATUS_BADGE_STYLES[d.status] || "bg-slate-800 text-slate-300"}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-slate-300">
                        {d.assigned_vehicle}
                      </td>
                      <td className="p-4 font-mono text-[11px] text-slate-400 truncate max-w-[150px]">
                        {d.current_trip}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => { setSelectedDriver(d); setShowDetailModal(true); }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-semibold transition"
                        >
                          View
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEdit(d)}
                              className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 rounded-lg text-[11px] font-semibold transition"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(d)}
                              className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded-lg text-[11px] font-semibold transition"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Add Driver */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">+ Add New Driver</h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Full Name *</label>
                  <input
                    type="text" required
                    placeholder="e.g. Ravi Kumar"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Email *</label>
                  <input
                    type="email" required
                    placeholder="driver@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Phone</label>
                  <input
                    type="text"
                    placeholder="9876543210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">License Number</label>
                    <input
                      type="text"
                      placeholder="DL-9920210"
                      value={form.license_number}
                      onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">License Expiry</label>
                    <input
                      type="date"
                      value={form.license_expiry}
                      onChange={(e) => setForm({ ...form, license_expiry: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Initial Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Available">Available</option>
                    <option value="On Trip">On Trip</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold rounded-xl hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {actionLoading ? "Creating..." : "Create Driver"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Driver */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Edit Driver</h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Full Name</label>
                  <input
                    type="text" required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">License Number</label>
                    <input
                      type="text"
                      value={form.license_number}
                      onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">License Expiry</label>
                    <input
                      type="date"
                      value={form.license_expiry}
                      onChange={(e) => setForm({ ...form, license_expiry: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Available">Available</option>
                    <option value="On Trip">On Trip</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold rounded-xl hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Driver Details */}
        {showDetailModal && selectedDriver && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Driver Profile Details</h3>
                <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Driver ID</span>
                  <span className="font-mono text-cyan-400 font-bold">DRV-{selectedDriver.driver_id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Full Name</span>
                  <span className="font-bold text-white">{selectedDriver.full_name}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Email</span>
                  <span className="text-slate-300">{selectedDriver.email}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Phone</span>
                  <span className="text-slate-300">{selectedDriver.phone}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">License Number</span>
                  <span className="font-mono text-slate-300">{selectedDriver.license_number}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">License Expiry</span>
                  <span className="font-mono text-slate-400">{selectedDriver.license_expiry}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Current Status</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_BADGE_STYLES[selectedDriver.status]}`}>
                    {selectedDriver.status}
                  </span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Assigned Vehicle</span>
                  <span className="font-bold text-cyan-300">{selectedDriver.assigned_vehicle}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Current Trip</span>
                  <span className="font-mono text-slate-300">{selectedDriver.current_trip}</span>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-800">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Delete Driver Confirmation */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white">Deactivate Driver?</h3>
              <p className="text-xs text-slate-400">
                Are you sure you want to remove driver <strong className="text-white">{deleteConfirm.full_name}</strong>?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.driver_id)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-500 disabled:opacity-50"
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
