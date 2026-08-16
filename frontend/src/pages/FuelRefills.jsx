import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { getFuelRecords, createFuelRecord, deleteFuelRecord } from "../api/fuel";
import { getVehicles } from "../api/vehicles";
import { getDrivers } from "../api/drivers";

const emptyForm = {
  vehicle_id: "",
  driver_id: "",
  refill_date: new Date().toISOString().slice(0, 10),
  fuel_type: "Diesel",
  litres: "",
  price_per_litre: "94.50",
  odometer_reading: "",
  location: "Kakinada Station",
  notes: "",
};

export default function FuelRefills() {
  const { user } = useAuth();
  const canManage =
    user?.role === "Admin" ||
    user?.role === "FleetManager" ||
    user?.role === "Dispatcher";

  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fuelRes, vehRes, drvRes] = await Promise.all([
        getFuelRecords(),
        getVehicles().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
      ]);
      setRecords(fuelRes.data || []);
      setVehicles(vehRes.data || []);
      setDrivers(drvRes.data || []);
    } catch (err) {
      setError("Failed to load fuel refill records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_id) {
      setError("Please select a vehicle.");
      return;
    }
    if (Number(form.litres) <= 0 || Number(form.price_per_litre) <= 0) {
      setError("Litres and Price per Litre must be greater than 0.");
      return;
    }

    setActionLoading(true);
    setError("");
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || null,
        refill_date: form.refill_date,
        fuel_type: form.fuel_type,
        litres: Number(form.litres),
        price_per_litre: Number(form.price_per_litre),
        odometer_reading: form.odometer_reading ? Number(form.odometer_reading) : 0,
        location: form.location,
        notes: form.notes,
      };
      await createFuelRecord(payload);
      setShowAddModal(false);
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to log fuel refill");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (fuelId) => {
    setActionLoading(true);
    try {
      await deleteFuelRecord(fuelId);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete record");
    } finally {
      setActionLoading(false);
    }
  };

  // Metrics
  const totalRefills = records.length;
  const totalLitres = records.reduce((acc, r) => acc + (Number(r.litres) || 0), 0);
  const totalCost = records.reduce((acc, r) => acc + (Number(r.total_cost) || 0), 0);
  const avgPrice = totalLitres > 0 ? totalCost / totalLitres : 0;
  const avgEfficiency = records.length > 0
    ? records.reduce((acc, r) => acc + (Number(r.km_per_litre) || 12.5), 0) / records.length
    : 12.5;

  const filteredRecords = records.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.registration_number?.toLowerCase().includes(q) ||
      r.driver_name?.toLowerCase().includes(q) ||
      r.location?.toLowerCase().includes(q) ||
      r.fuel_type?.toLowerCase().includes(q)
    );
  });

  const computedTotalCost =
    form.litres && form.price_per_litre
      ? (Number(form.litres) * Number(form.price_per_litre)).toFixed(2)
      : "0.00";

  return (
    <div className="flex min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Fuel Refills & Efficiency</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase mt-1">
              FLEET FUEL CONSUMPTION & ECONOMY ANALYTICS
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

        {/* 5 Summary Analytics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <p className="text-[10px] text-slate-400 font-mono font-bold uppercase">TOTAL REFILLS</p>
            <h3 className="text-2xl font-extrabold text-white mt-1">{totalRefills}</h3>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">LOGGED ENTRIES</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <p className="text-[10px] text-cyan-400 font-mono font-bold uppercase">FUEL CONSUMED</p>
            <h3 className="text-2xl font-extrabold text-cyan-300 mt-1">{totalLitres.toFixed(1)} L</h3>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">TOTAL LITRES</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <p className="text-[10px] text-purple-400 font-mono font-bold uppercase">TOTAL FUEL COST</p>
            <h3 className="text-2xl font-extrabold text-purple-300 mt-1">₹{totalCost.toFixed(2)}</h3>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">TOTAL EXPENDITURE</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <p className="text-[10px] text-amber-400 font-mono font-bold uppercase">AVG FUEL PRICE</p>
            <h3 className="text-2xl font-extrabold text-amber-300 mt-1">₹{avgPrice.toFixed(2)}/L</h3>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">UNIT PRICE</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase">FLEET EFFICIENCY</p>
            <h3 className="text-2xl font-extrabold text-emerald-400 mt-1">{avgEfficiency.toFixed(1)} KM/L</h3>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">AVG KM PER LITRE</p>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4">
          <input
            type="text"
            placeholder="Search by vehicle, driver, location, fuel type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-full sm:w-72"
          />

          {canManage && (
            <button
              onClick={() => {
                setForm(emptyForm);
                setShowAddModal(true);
              }}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2"
            >
              <span>+ New Fuel Refill</span>
            </button>
          )}
        </div>

        {/* Table View */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 font-mono text-sm">Loading Fuel Records...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl text-slate-500 text-sm font-mono">
            No fuel refill records logged yet.
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                    <th className="p-4">REFILL ID</th>
                    <th className="p-4">VEHICLE</th>
                    <th className="p-4">DRIVER</th>
                    <th className="p-4">DATE</th>
                    <th className="p-4">TYPE</th>
                    <th className="p-4">LITRES</th>
                    <th className="p-4">PRICE/L</th>
                    <th className="p-4">TOTAL COST</th>
                    <th className="p-4">EFFICIENCY</th>
                    <th className="p-4">LOCATION</th>
                    <th className="p-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredRecords.map((r) => (
                    <tr key={r.fuel_id} className="hover:bg-slate-800/40 transition">
                      <td className="p-4 text-cyan-400 font-bold">
                        FUEL-{r.fuel_id.slice(0, 6).toUpperCase()}
                      </td>
                      <td className="p-4 font-sans font-bold text-white">
                        {r.registration_number} ({r.vehicle_brand})
                      </td>
                      <td className="p-4 font-sans text-slate-300">
                        {r.driver_name}
                      </td>
                      <td className="p-4 text-slate-400">
                        {r.refill_date}
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-cyan-300 border border-slate-700 font-bold">
                          {r.fuel_type}
                        </span>
                      </td>
                      <td className="p-4 text-white font-bold">
                        {r.litres} L
                      </td>
                      <td className="p-4 text-slate-300">
                        ₹{r.price_per_litre}
                      </td>
                      <td className="p-4 text-purple-300 font-bold">
                        ₹{r.total_cost}
                      </td>
                      <td className="p-4 text-emerald-400 font-bold">
                        {r.km_per_litre} KM/L
                      </td>
                      <td className="p-4 font-sans text-slate-400">
                        {r.location}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {canManage && (
                          <button
                            onClick={() => setDeleteConfirm(r)}
                            className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded-lg text-[11px] font-semibold transition"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Add Fuel Refill */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white">+ Log New Fuel Refill</h3>
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
                        {v.registration_number} ({v.brand} {v.model})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Select Driver</label>
                  <select
                    value={form.driver_id}
                    onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">-- Choose Driver (Optional) --</option>
                    {drivers.map((d) => (
                      <option key={d.driver_id} value={d.driver_id}>
                        {d.full_name} ({d.license_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Refill Date</label>
                    <input
                      type="date"
                      value={form.refill_date}
                      onChange={(e) => setForm({ ...form, refill_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Fuel Type</label>
                    <select
                      value={form.fuel_type}
                      onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="Diesel">Diesel</option>
                      <option value="Petrol">Petrol</option>
                      <option value="CNG">CNG</option>
                      <option value="Electric">Electric</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Litres Refilled *</label>
                    <input
                      type="number" step="0.1" required min="0.1"
                      placeholder="e.g. 50"
                      value={form.litres}
                      onChange={(e) => setForm({ ...form, litres: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Price per Litre (₹) *</label>
                    <input
                      type="number" step="0.01" required min="0.1"
                      placeholder="e.g. 94.50"
                      value={form.price_per_litre}
                      onChange={(e) => setForm({ ...form, price_per_litre: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Auto Calculated Total Cost */}
                <div className="bg-slate-950 border border-purple-800/60 p-3 rounded-xl flex justify-between items-center">
                  <span className="text-slate-400 font-semibold">Calculated Total Cost:</span>
                  <span className="text-purple-300 font-bold font-mono text-sm">₹{computedTotalCost}</span>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Odometer Reading (KM)</label>
                  <input
                    type="number"
                    placeholder="e.g. 45200"
                    value={form.odometer_reading}
                    onChange={(e) => setForm({ ...form, odometer_reading: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Station / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. HP Fuel Station, Vijayawada"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
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
                    {actionLoading ? "Saving..." : "Log Fuel Refill"}
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
              <h3 className="text-base font-bold text-white">Delete Fuel Record?</h3>
              <p className="text-xs text-slate-400">
                Are you sure you want to delete refill record for <strong className="text-white">{deleteConfirm.registration_number}</strong>?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.fuel_id)}
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
