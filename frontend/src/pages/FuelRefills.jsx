import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { getFuelRecords, createFuelRecord, updateFuelRecord, deleteFuelRecord } from "../api/fuel";
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
  const rawRole = user?.role;
  const normalizedRole = typeof rawRole === "string"
    ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");

  // 10.pdf Permission Matrix:
  // Admin -> Full access (Log, Edit, Delete)
  // Fleet Manager -> Full access (Log, Edit, Delete)
  // Dispatcher -> NO access
  // Driver -> Log & Edit for assigned vehicle only
  const isAdminOrFm = normalizedRole === "admin" || normalizedRole === "fleetmanager";
  const isDriver = normalizedRole === "driver";
  const isDispatcher = normalizedRole === "dispatcher";

  const canLogFuel = isAdminOrFm || isDriver;
  const canEditFuel = isAdminOrFm || isDriver;
  const canDeleteFuel = isAdminOrFm;

  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const myDriver = drivers.find(
    (d) => d.user_id === user?.user_id || d.email === user?.email || (user?.full_name && d.full_name && d.full_name.toLowerCase() === user.full_name.toLowerCase())
  );
  const myAssignedVehicles = isDriver
    ? vehicles.filter((v) => v.assigned_driver_id === myDriver?.driver_id)
    : vehicles;

  const openAdd = () => {
    const assignedVeh = myAssignedVehicles[0];
    setForm({
      ...emptyForm,
      vehicle_id: isDriver && assignedVeh ? assignedVeh.vehicle_id : (vehicles[0]?.vehicle_id || ""),
      driver_id: isDriver && myDriver ? myDriver.driver_id : "",
    });
    setShowAddModal(true);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [fuelRes, vehRes, drvRes] = await Promise.all([
        getFuelRecords(),
        getVehicles().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
      ]);
      setRecords(fuelRes.data || []);
      setVehicles(vehRes.data || []);
      setDrivers(drvRes.data || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access Restricted: Your role is not authorized to view fuel records.");
      } else {
        setError("Failed to load fuel refill records");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

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
    setSuccessMsg("");
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id: isDriver ? (myDriver?.driver_id || null) : (form.driver_id || null),
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
      setSuccessMsg("Fuel refill logged successfully!");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to log fuel refill");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;
    if (Number(form.litres) <= 0 || Number(form.price_per_litre) <= 0) {
      setError("Litres and Price per Litre must be greater than 0.");
      return;
    }

    setActionLoading(true);
    setError("");
    setSuccessMsg("");
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
      await updateFuelRecord(editingRecord.fuel_id || editingRecord.id, payload);
      setShowEditModal(false);
      setEditingRecord(null);
      setForm(emptyForm);
      setSuccessMsg("Fuel record updated successfully!");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update fuel record");
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (r) => {
    setEditingRecord(r);
    setForm({
      vehicle_id: r.vehicle_id || "",
      driver_id: r.driver_id || "",
      refill_date: r.refill_date || new Date().toISOString().slice(0, 10),
      fuel_type: r.fuel_type || "Diesel",
      litres: String(r.litres || ""),
      price_per_litre: String(r.price_per_litre || ""),
      odometer_reading: String(r.odometer_reading || ""),
      location: r.location || "",
      notes: r.notes || "",
    });
    setShowEditModal(true);
  };

  const handleDelete = async (fuelId) => {
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      await deleteFuelRecord(fuelId);
      setDeleteConfirm(null);
      setSuccessMsg("Fuel record deleted.");
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
    <div className="flex min-h-screen bg-[#F0FDFA] text-[#1F2937] font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">Fuel Refills & Efficiency</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-[#0F766E] uppercase mt-1">
              FLEET FUEL CONSUMPTION & ECONOMY ANALYTICS
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="px-3 py-2 bg-white hover:bg-[#CCFBF1]/50 border border-[#E5E7EB] text-[#1F2937] text-xs font-semibold rounded-xl shadow-xs transition"
            >
              🔄 Refresh
            </button>
            <span className="text-xs font-mono text-[#6B7280]">
              OPERATOR: <strong className="text-[#1F2937]">{user?.full_name?.toUpperCase()} ({user?.role?.toUpperCase()})</strong>
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-600">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>✓ {successMsg}</span>
            <button onClick={() => setSuccessMsg("")} className="text-emerald-400 hover:text-emerald-600">✕</button>
          </div>
        )}

        {/* 5 Summary Analytics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] text-[#6B7280] font-mono font-bold uppercase">TOTAL REFILLS</p>
            <h3 className="text-2xl font-extrabold text-[#1F2937] mt-1">{totalRefills}</h3>
            <p className="text-[10px] text-[#6B7280] mt-1 font-mono">LOGGED ENTRIES</p>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] text-[#14B8A6] font-mono font-bold uppercase">FUEL CONSUMED</p>
            <h3 className="text-2xl font-extrabold text-[#14B8A6] mt-1">{totalLitres.toFixed(1)} L</h3>
            <p className="text-[10px] text-[#6B7280] mt-1 font-mono">TOTAL LITRES</p>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] text-[#0F766E] font-mono font-bold uppercase">TOTAL FUEL COST</p>
            <h3 className="text-2xl font-extrabold text-[#0F766E] mt-1">₹{totalCost.toFixed(2)}</h3>
            <p className="text-[10px] text-[#6B7280] mt-1 font-mono">TOTAL EXPENDITURE</p>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] text-amber-600 font-mono font-bold uppercase">AVG FUEL PRICE</p>
            <h3 className="text-2xl font-extrabold text-amber-600 mt-1">₹{avgPrice.toFixed(2)}/L</h3>
            <p className="text-[10px] text-[#6B7280] mt-1 font-mono">UNIT PRICE</p>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] text-emerald-600 font-mono font-bold uppercase">FLEET EFFICIENCY</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{avgEfficiency.toFixed(1)} KM/L</h3>
            <p className="text-[10px] text-[#6B7280] mt-1 font-mono">AVG KM PER LITRE</p>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4 shadow-xs">
          <input
            type="text"
            placeholder="Search by vehicle, driver, location, fuel type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl text-xs text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:border-[#0F766E] w-full sm:w-72"
          />

          {canLogFuel && (
            <button
              onClick={openAdd}
              className="px-4 py-2.5 bg-[#0F766E] hover:bg-[#115E59] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2"
            >
              <span>+ New Fuel Refill</span>
            </button>
          )}
        </div>

        {/* Table View */}
        {loading ? (
          <div className="p-12 text-center text-[#6B7280] font-mono text-sm">Loading Fuel Records...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center bg-white border border-[#E5E7EB] rounded-2xl text-[#6B7280] text-sm font-mono">
            No fuel refill records logged yet.
          </div>
        ) : (
          <div className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F0FDFA] border-b border-[#E5E7EB] text-[#6B7280] font-mono uppercase text-[10px] tracking-wider">
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
                <tbody className="divide-y divide-[#E5E7EB] font-mono">
                  {filteredRecords.map((r) => {
                    const isMyRecord = !isDriver || (myDriver && r.driver_id === myDriver.driver_id);
                    return (
                    <tr key={r.fuel_id || r.id} className="hover:bg-[#F0FDFA]/60 transition">
                      <td className="p-4 text-[#0F766E] font-bold">
                        FUEL-{(r.fuel_id || r.id).slice(0, 6).toUpperCase()}
                      </td>
                      <td className="p-4 font-sans font-bold text-[#1F2937]">
                        {r.registration_number} ({r.vehicle_brand || r.brand || ""})
                      </td>
                      <td className="p-4 font-sans text-[#6B7280]">
                        {r.driver_name || "Unassigned"}
                      </td>
                      <td className="p-4 text-[#6B7280]">
                        {r.refill_date}
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 bg-[#CCFBF1] text-[#0F766E] rounded text-[10px] font-bold">
                          {r.fuel_type}
                        </span>
                      </td>
                      <td className="p-4 text-[#1F2937] font-bold">
                        {r.litres} L
                      </td>
                      <td className="p-4 text-[#6B7280]">
                        ₹{r.price_per_litre}
                      </td>
                      <td className="p-4 text-[#0F766E] font-bold">
                        ₹{r.total_cost}
                      </td>
                      <td className="p-4 text-emerald-700 font-bold">
                        {r.km_per_litre} KM/L
                      </td>
                      <td className="p-4 font-sans text-[#6B7280]">
                        {r.location}
                      </td>
                      <td className="p-4 text-right space-x-1.5">
                        {canEditFuel && isMyRecord && (
                          <button
                            onClick={() => openEdit(r)}
                            className="px-2.5 py-1 bg-[#CCFBF1] hover:bg-[#CCFBF1]/80 text-[#0F766E] border border-[#14B8A6]/40 rounded-lg text-[11px] font-semibold transition"
                            title="Edit Fuel Record"
                          >
                            Edit
                          </button>
                        )}
                        {canDeleteFuel && (
                          <button
                            onClick={() => setDeleteConfirm(r)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-semibold transition"
                            title="Delete Fuel Record"
                          >
                            Delete
                          </button>
                        )}
                        {!canEditFuel && !canDeleteFuel && (
                          <span className="text-[10px] text-[#6B7280] font-mono italic">Read Only</span>
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Add Fuel Refill */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <h3 className="text-lg font-bold text-slate-900">+ Log New Fuel Refill</h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">
                    {isDriver ? "Assigned Vehicle *" : "Select Vehicle *"}
                  </label>
                  <select
                    required
                    value={form.vehicle_id}
                    onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  >
                    <option value="">{isDriver ? "-- Choose Assigned Vehicle --" : "-- Choose Vehicle --"}</option>
                    {(isDriver ? myAssignedVehicles : vehicles).map((v) => (
                      <option key={v.vehicle_id} value={v.vehicle_id}>
                        {v.registration_number} ({v.brand} {v.model})
                      </option>
                    ))}
                  </select>
                </div>

                {!isDriver && (
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Select Driver</label>
                    <select
                      value={form.driver_id}
                      onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    >
                      <option value="">-- Choose Driver (Optional) --</option>
                      {drivers.map((d) => (
                        <option key={d.driver_id} value={d.driver_id}>
                          {d.full_name} ({d.license_number})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Refill Date</label>
                    <input
                      type="date"
                      value={form.refill_date}
                      onChange={(e) => setForm({ ...form, refill_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Fuel Type</label>
                    <select
                      value={form.fuel_type}
                      onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
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
                    <label className="block text-slate-600 mb-1 font-semibold">Litres Refilled *</label>
                    <input
                      type="number" step="0.1" required min="0.1"
                      placeholder="e.g. 50"
                      value={form.litres}
                      onChange={(e) => setForm({ ...form, litres: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Price per Litre (₹) *</label>
                    <input
                      type="number" step="0.01" required min="0.1"
                      placeholder="e.g. 94.50"
                      value={form.price_per_litre}
                      onChange={(e) => setForm({ ...form, price_per_litre: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                {/* Auto Calculated Total Cost */}
                <div className="bg-[#CCFBF1]/40 border border-[#14B8A6]/30 p-3 rounded-xl flex justify-between items-center">
                  <span className="text-[#1F2937] font-semibold">Calculated Total Cost:</span>
                  <span className="text-[#0F766E] font-bold font-mono text-sm">₹{computedTotalCost}</span>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Odometer Reading (KM)</label>
                  <input
                    type="number"
                    placeholder="e.g. 45200"
                    value={form.odometer_reading}
                    onChange={(e) => setForm({ ...form, odometer_reading: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Station / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. HP Fuel Station, Vijayawada"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Notes / Remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Refill notes..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-[#0F766E] text-white font-bold rounded-xl hover:bg-[#115E59] disabled:opacity-50 text-xs"
                  >
                    {actionLoading ? "Saving..." : "Log Fuel Refill"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Fuel Refill */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <h3 className="text-lg font-bold text-slate-900">Update Fuel Refill Record</h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
                {isAdminOrFm ? (
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Vehicle</label>
                    <select
                      value={form.vehicle_id}
                      onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    >
                      {vehicles.map((v) => (
                        <option key={v.vehicle_id} value={v.vehicle_id}>
                          {v.registration_number} ({v.brand} {v.model})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Assigned Vehicle</label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={`${editingRecord?.registration_number || ""} (${editingRecord?.vehicle_brand || "Assigned Vehicle"})`}
                      className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 cursor-not-allowed font-mono"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Refill Date</label>
                    <input
                      type="date"
                      value={form.refill_date}
                      onChange={(e) => setForm({ ...form, refill_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Fuel Type</label>
                    <select
                      value={form.fuel_type}
                      onChange={(e) => setForm({ ...form, fuel_type: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
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
                    <label className="block text-slate-600 mb-1 font-semibold">Litres Refilled *</label>
                    <input
                      type="number" step="0.1" required min="0.1"
                      value={form.litres}
                      onChange={(e) => setForm({ ...form, litres: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Price per Litre (₹) *</label>
                    <input
                      type="number" step="0.01" required min="0.1"
                      value={form.price_per_litre}
                      onChange={(e) => setForm({ ...form, price_per_litre: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 font-semibold">Calculated Total Cost:</span>
                  <span className="text-blue-700 font-bold font-mono text-sm">₹{computedTotalCost}</span>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Odometer Reading (KM)</label>
                  <input
                    type="number"
                    value={form.odometer_reading}
                    onChange={(e) => setForm({ ...form, odometer_reading: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Station / Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Notes</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-[#0F766E] text-white font-bold rounded-xl hover:bg-[#115E59] disabled:opacity-50 text-xs"
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
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-slate-900">Delete Fuel Record?</h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to delete refill record for <strong className="text-slate-900">{deleteConfirm.registration_number}</strong>?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl hover:bg-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.fuel_id || deleteConfirm.id)}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 disabled:opacity-50"
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
