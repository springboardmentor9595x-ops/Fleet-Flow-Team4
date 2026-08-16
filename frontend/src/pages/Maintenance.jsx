import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { getMaintenance, createMaintenance, updateMaintenance, deleteMaintenance } from "../api/maintenance";
import { getVehicles } from "../api/vehicles";

const emptyForm = {
  vehicle_id: "",
  maintenance_type: "General Inspection",
  scheduled_date: new Date().toISOString().split("T")[0],
  description: "",
  cost: 0,
  status: "Scheduled",
};

const STATUS_BADGE_STYLES = {
  Scheduled: "bg-amber-950/80 text-amber-300 border-amber-700 font-bold",
  "In Progress": "bg-purple-950/80 text-purple-300 border-purple-700 font-bold animate-pulse",
  Completed: "bg-emerald-950/80 text-emerald-300 border-emerald-700 font-bold",
  Cancelled: "bg-rose-950/80 text-rose-300 border-rose-700 font-bold",
};

export default function MaintenancePage() {
  const { user } = useAuth();
  const canManage =
    user?.role === "Admin" ||
    user?.role === "FleetManager";

  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [mRes, vRes] = await Promise.all([
        getMaintenance(),
        getVehicles().catch(() => ({ data: [] })),
      ]);
      setRecords(mRes.data || []);
      setVehicles(vRes.data || []);
    } catch (err) {
      setError("Failed to load maintenance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered maintenance records
  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      !searchQuery ||
      r.registration_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "All" || r.maintenance_type === typeFilter;
    const matchesStatus = statusFilter === "All" || r.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Metrics
  const totalRecords = records.length;
  const scheduledCount = records.filter((r) => r.status === "Scheduled").length;
  const inProgressCount = records.filter((r) => r.status === "In Progress").length;
  const completedCount = records.filter((r) => r.status === "Completed").length;

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_id) {
      setError("Please select a vehicle");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      await createMaintenance(form);
      setShowAddModal(false);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to schedule maintenance");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;
    setActionLoading(true);
    setError("");
    try {
      await updateMaintenance(editingRecord.maintenance_id, form);
      setShowEditModal(false);
      setEditingRecord(null);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update maintenance record");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setActionLoading(true);
    try {
      await deleteMaintenance(id);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete maintenance record");
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (r) => {
    setEditingRecord(r);
    setForm({
      vehicle_id: r.vehicle_id || "",
      maintenance_type: r.maintenance_type || "General Inspection",
      scheduled_date: r.scheduled_date || "",
      description: r.description || "",
      cost: r.cost || 0,
      status: r.status || "Scheduled",
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
            <h1 className="text-3xl font-bold text-white tracking-tight">Maintenance</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase mt-1">
              SCHEDULE AND TRACK VEHICLE SERVICE, REPAIRS AND HEALTH
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
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5">🛠️</div>
            <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">TOTAL RECORDS</p>
            <h3 className="text-3xl font-extrabold text-white mt-1">{totalRecords}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">ALL SERVICE LOGS</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-amber-500">📅</div>
            <p className="text-[10px] text-amber-400 font-mono font-bold uppercase tracking-wider">SCHEDULED</p>
            <h3 className="text-3xl font-extrabold text-amber-300 mt-1">{scheduledCount}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">UPCOMING SERVICE</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-purple-500">⚙️</div>
            <p className="text-[10px] text-purple-400 font-mono font-bold uppercase tracking-wider">IN PROGRESS</p>
            <h3 className="text-3xl font-extrabold text-purple-300 mt-1">{inProgressCount}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">CURRENTLY SERVICING</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-emerald-500">✅</div>
            <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider">COMPLETED</p>
            <h3 className="text-3xl font-extrabold text-emerald-400 mt-1">{completedCount}</h3>
            <p className="text-[10px] text-slate-500 mt-2 font-mono">SERVICE COMPLETED</p>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <input
              type="text"
              placeholder="Search by vehicle registration, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-full sm:w-72"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="All">All Types</option>
              <option value="General Inspection">General Inspection</option>
              <option value="Oil Change">Oil Change</option>
              <option value="Tyre Replacement">Tyre Replacement</option>
              <option value="Engine Service">Engine Service</option>
              <option value="Brake Service">Brake Service</option>
              <option value="Repair">Repair</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="All">All Statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
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
              <span>+ Schedule Maintenance</span>
            </button>
          )}
        </div>

        {/* Maintenance Table View */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 font-mono text-sm">Loading Maintenance Records...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500 text-sm font-mono">
            No maintenance records found.
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                    <th className="p-4">MAINTENANCE ID</th>
                    <th className="p-4">VEHICLE REG NO.</th>
                    <th className="p-4">VEHICLE MODEL</th>
                    <th className="p-4">MAINTENANCE TYPE</th>
                    <th className="p-4">SCHEDULED DATE</th>
                    <th className="p-4">COST (₹)</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4">DESCRIPTION</th>
                    <th className="p-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRecords.map((r) => (
                    <tr key={r.maintenance_id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4 font-mono text-cyan-400 font-semibold">
                        MNT-{r.maintenance_id.slice(0, 6).toUpperCase()}
                      </td>
                      <td className="p-4 font-bold text-white">
                        {r.registration_number}
                      </td>
                      <td className="p-4 text-slate-300">
                        {r.model}
                      </td>
                      <td className="p-4 font-semibold text-purple-300">
                        {r.maintenance_type}
                      </td>
                      <td className="p-4 font-mono text-slate-400">
                        {r.scheduled_date}
                      </td>
                      <td className="p-4 font-mono text-emerald-400 font-bold">
                        ₹{r.cost ? r.cost.toLocaleString() : "0"}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] border ${STATUS_BADGE_STYLES[r.status] || "bg-slate-800 text-slate-300"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 max-w-[200px] truncate">
                        {r.description}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEdit(r)}
                              className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 rounded-lg text-[11px] font-semibold transition"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(r)}
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

        {/* Modal: Schedule Maintenance */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">+ Schedule Maintenance</h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Select Vehicle *</label>
                  <select
                    required
                    value={form.vehicle_id}
                    onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Vehicle --</option>
                    {vehicles.map((v) => (
                      <option key={v.vehicle_id} value={v.vehicle_id}>
                        {v.registration_number} ({v.brand} {v.model}) - Status: {v.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Maintenance Type</label>
                  <select
                    value={form.maintenance_type}
                    onChange={(e) => setForm({ ...form, maintenance_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="General Inspection">General Inspection</option>
                    <option value="Oil Change">Oil Change</option>
                    <option value="Tyre Replacement">Tyre Replacement</option>
                    <option value="Engine Service">Engine Service</option>
                    <option value="Brake Service">Brake Service</option>
                    <option value="Repair">Repair</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Scheduled Date</label>
                    <input
                      type="date"
                      value={form.scheduled_date}
                      onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Estimated Cost (₹)</label>
                    <input
                      type="number"
                      placeholder="4500"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })}
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
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Description / Remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Provide details about the vehicle issue or routine service..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
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
                    {actionLoading ? "Scheduling..." : "Schedule Service"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Maintenance */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">Update Maintenance Record</h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Maintenance Type</label>
                  <select
                    value={form.maintenance_type}
                    onChange={(e) => setForm({ ...form, maintenance_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="General Inspection">General Inspection</option>
                    <option value="Oil Change">Oil Change</option>
                    <option value="Tyre Replacement">Tyre Replacement</option>
                    <option value="Engine Service">Engine Service</option>
                    <option value="Brake Service">Brake Service</option>
                    <option value="Repair">Repair</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Scheduled Date</label>
                    <input
                      type="date"
                      value={form.scheduled_date}
                      onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Cost (₹)</label>
                    <input
                      type="number"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })}
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
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed (Restores Vehicle to Available)</option>
                    <option value="Cancelled">Cancelled (Restores Vehicle to Available)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Description / Remarks</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
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

        {/* Modal: Delete Confirmation */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white">Delete Maintenance Record?</h3>
              <p className="text-xs text-slate-400">
                Are you sure you want to delete maintenance record <strong className="text-white">MNT-{deleteConfirm.maintenance_id.slice(0, 6).toUpperCase()}</strong>?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.maintenance_id)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-500 disabled:opacity-50"
                >
                  {actionLoading ? "Deleting..." : "Delete Record"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
