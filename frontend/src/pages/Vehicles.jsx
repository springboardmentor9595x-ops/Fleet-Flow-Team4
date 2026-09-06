import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import {
  getVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from "../api/vehicles";
import toast from "react-hot-toast";

const emptyForm = {
  registration_number: "",
  vehicle_type: "Truck",
  brand: "",
  model: "",
  manufacture_year: new Date().getFullYear(),
  fuel_type: "Diesel",
  capacity: 1000,
  status: "Available",
};

const STATUS_COLORS = {
  Available: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold",
  Assigned: "bg-blue-50 text-blue-700 border border-blue-200 font-semibold",
  Maintenance: "bg-amber-50 text-amber-700 border border-amber-200 font-semibold",
  "In Transit": "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/40 font-semibold",
};

export default function Vehicles() {
  const { user } = useAuth();
  const rawRole = user?.role;
  const normalizedRole = typeof rawRole === "string"
    ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");
  const canManage = normalizedRole === "admin" || normalizedRole === "fleetmanager";

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getVehicles();
      setVehicles(res.data || []);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load vehicle records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddModal = () => {
    setEditingVehicle(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (veh) => {
    setEditingVehicle(veh);
    setForm({
      registration_number: veh.registration_number,
      vehicle_type: veh.vehicle_type,
      brand: veh.brand,
      model: veh.model,
      manufacture_year: veh.manufacture_year,
      fuel_type: veh.fuel_type,
      capacity: veh.capacity,
      status: veh.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError("");
    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.vehicle_id, form);
        toast.success("Vehicle updated successfully!");
      } else {
        await createVehicle(form);
        toast.success("Vehicle registered successfully!");
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save vehicle details");
      toast.error(err.response?.data?.detail || "Failed to save vehicle");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    try {
      await deleteVehicle(deleteConfirm.vehicle_id);
      toast.success("Vehicle deleted successfully");
      setDeleteConfirm(null);
      loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete vehicle");
      toast.error(err.response?.data?.detail || "Failed to delete vehicle");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      !searchQuery ||
      v.registration_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.vehicle_type?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const availableCount = vehicles.filter((v) => v.status === "Available").length;
  const inTransitCount = vehicles.filter((v) => v.status === "In Transit" || v.status === "Assigned").length;
  const maintCount = vehicles.filter((v) => v.status === "Maintenance").length;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-white">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vehicle Asset Registry</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-blue-600 uppercase mt-1">
              PHYSICAL FLEET INVENTORY, SPECIFICATIONS & DEPLOYMENT STATUS
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition flex items-center gap-2"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              <span>Refresh</span>
            </button>
            {canManage && (
              <button
                onClick={openAddModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold font-mono rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <span>+</span>
                <span>Register Vehicle</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {/* Status Metrics Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">TOTAL ASSETS</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{vehicles.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">AVAILABLE</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">{availableCount}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-wider">IN TRANSIT / ASSIGNED</p>
            <p className="text-2xl font-extrabold text-blue-600 mt-1">{inTransitCount}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">MAINTENANCE</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">{maintCount}</p>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by registration number, brand, model, or type..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {["ALL", "Available", "Assigned", "In Transit", "Maintenance"].map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs transition ${
                  statusFilter === tab
                    ? "bg-blue-600 text-white font-bold shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Vehicles Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wide">
              Registered Vehicles ({filteredVehicles.length} Total)
            </h3>
            <span className="text-[10px] font-mono text-slate-400">Source: Real PostgreSQL Database</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">REG NO.</th>
                  <th className="p-3.5">TYPE</th>
                  <th className="p-3.5">MAKE & MODEL</th>
                  <th className="p-3.5">YEAR</th>
                  <th className="p-3.5">FUEL</th>
                  <th className="p-3.5">CAPACITY</th>
                  <th className="p-3.5">STATUS</th>
                  {canManage && <th className="p-3.5 text-right">ACTIONS</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11px]">
                {loading ? (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="p-12 text-center text-slate-400">
                      <span className="animate-spin inline-block mr-2">🔄</span> Loading fleet assets...
                    </td>
                  </tr>
                ) : filteredVehicles.length > 0 ? (
                  filteredVehicles.map((v) => (
                    <tr key={v.vehicle_id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-bold text-slate-900">{v.registration_number}</td>
                      <td className="p-3.5 text-slate-600">{v.vehicle_type}</td>
                      <td className="p-3.5 font-semibold text-slate-800">{v.brand} {v.model}</td>
                      <td className="p-3.5 text-slate-500">{v.manufacture_year}</td>
                      <td className="p-3.5 text-slate-600">{v.fuel_type}</td>
                      <td className="p-3.5 text-slate-600">{v.capacity} kg</td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] ${STATUS_COLORS[v.status] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                          {v.status}
                        </span>
                      </td>
                      {canManage && (
                        <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => openEditModal(v)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(v)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="p-12 text-center text-slate-400 font-mono">
                      No vehicles matching filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create / Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
                  {editingVehicle ? "Edit Vehicle Asset" : "Register New Vehicle Asset"}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-mono">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Registration No. *</label>
                    <input
                      type="text"
                      required
                      value={form.registration_number}
                      onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                      placeholder="e.g. TS09AB1234"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Vehicle Type *</label>
                    <select
                      value={form.vehicle_type}
                      onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="Truck">Truck</option>
                      <option value="Van">Van</option>
                      <option value="Trailer">Trailer</option>
                      <option value="Pickup">Pickup</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Make / Brand *</label>
                    <input
                      type="text"
                      required
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      placeholder="e.g. Tata, BharatBenz"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Model *</label>
                    <input
                      type="text"
                      required
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="e.g. Prima 4928"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Year</label>
                    <input
                      type="number"
                      value={form.manufacture_year}
                      onChange={(e) => setForm({ ...form, manufacture_year: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Fuel Type</label>
                    <select
                      value={form.fuel_type}
                      onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="Diesel">Diesel</option>
                      <option value="Petrol">Petrol</option>
                      <option value="CNG">CNG</option>
                      <option value="Electric">Electric</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Capacity (kg)</label>
                    <input
                      type="number"
                      value={form.capacity}
                      onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Available">Available</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : editingVehicle ? "Update Vehicle" : "Register Vehicle"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-center font-mono">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-sm font-bold text-slate-900">Confirm Deletion</h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to delete vehicle <strong>{deleteConfirm.registration_number}</strong>? This action cannot be undone.
              </p>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition disabled:opacity-50"
                >
                  {actionLoading ? "Deleting..." : "Delete Vehicle"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
