import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import {
  getVehicles,
  getVehicleStatusCounts,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from "../api/vehicles";

const emptyForm = {
  registration_number: "",
  vehicle_type: "",
  brand: "",
  model: "",
  manufacture_year: "",
  fuel_type: "",
  capacity: "",
  status: "Available",
};

const STATUS_COLORS = {
  Available: "bg-green-500/20 text-green-400",
  Assigned: "bg-blue-500/20 text-blue-400",
  Maintenance: "bg-yellow-500/20 text-yellow-400",
  "In Transit": "bg-purple-500/20 text-purple-400",
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const isAdminOrManager = user?.role === "Admin" || user?.role === "FleetManager";

  const [vehicles, setVehicles] = useState([]);
  const [counts, setCounts] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      const [vRes, cRes] = await Promise.all([
        getVehicles(),
        getVehicleStatusCounts(),
      ]);
      setVehicles(vRes.data);
      setCounts(cRes.data);
    } catch (err) {
      setError("Failed to load vehicles");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setError("");
  };

  const openEditForm = (vehicle) => {
    setForm({
      registration_number: vehicle.registration_number,
      vehicle_type: vehicle.vehicle_type,
      brand: vehicle.brand,
      model: vehicle.model,
      manufacture_year: vehicle.manufacture_year,
      fuel_type: vehicle.fuel_type,
      capacity: vehicle.capacity,
      status: vehicle.status,
    });
    setEditingId(vehicle.vehicle_id);
    setShowForm(true);
    setError("");
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        manufacture_year: Number(form.manufacture_year),
        capacity: Number(form.capacity),
      };
      if (editingId) {
        await updateVehicle(editingId, payload);
      } else {
        await createVehicle(payload);
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong");
    }
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm("Delete this vehicle?")) return;
    try {
      await deleteVehicle(vehicleId);
      loadData();
    } catch (err) {
      setError("Failed to delete vehicle");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-cyan-400 text-xs tracking-widest uppercase mb-1">
            Fleet Logistics
          </p>
          <h1 className="text-2xl font-bold">Welcome, {user?.full_name}</h1>
          <p className="text-slate-400 text-sm">{user?.role}</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/shipments"
            className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 border border-slate-700"
          >
            📦 Shipments
          </Link>

          <Link
            to="/trips"
            className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 border border-slate-700"
          >
            🚚 Trips
          </Link>

          <button
            onClick={logout}
            className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 border border-slate-700"
          >
            Logout
          </button>
        </div>
      </div>

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Object.entries(counts).map(([key, value]) => (
            <div
              key={key}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center"
            >
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-slate-400 text-sm">{key}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">All Vehicles</h2>
        {isAdminOrManager && (
          <button
            onClick={openAddForm}
            className="px-4 py-2 bg-cyan-500 text-slate-950 font-semibold rounded-lg hover:bg-cyan-400"
          >
            + New Vehicle
          </button>
        )}
      </div>

      {error && <p className="text-red-400 mb-3">{error}</p>}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/50 text-slate-400">
            <tr>
              <th className="p-3">Reg. No.</th>
              <th className="p-3">Type</th>
              <th className="p-3">Brand / Model</th>
              <th className="p-3">Year</th>
              <th className="p-3">Fuel</th>
              <th className="p-3">Capacity</th>
              <th className="p-3">Status</th>
              {isAdminOrManager && <th className="p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.vehicle_id} className="border-t border-slate-800">
                <td className="p-3 font-medium">{v.registration_number}</td>
                <td className="p-3">{v.vehicle_type}</td>
                <td className="p-3">
                  {v.brand} {v.model}
                </td>
                <td className="p-3">{v.manufacture_year}</td>
                <td className="p-3">{v.fuel_type}</td>
                <td className="p-3">{v.capacity}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[v.status] || "bg-slate-700 text-slate-300"}`}
                  >
                    {v.status}
                  </span>
                </td>
                {isAdminOrManager && (
                  <td className="p-3 space-x-3">
                    <button
                      onClick={() => openEditForm(v)}
                      className="text-cyan-400 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(v.vehicle_id)}
                      className="text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-slate-500">
                  No vehicles found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? "Edit Vehicle" : "New Vehicle"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                name="registration_number"
                value={form.registration_number}
                onChange={handleChange}
                placeholder="Registration Number"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                name="vehicle_type"
                value={form.vehicle_type}
                onChange={handleChange}
                placeholder="Vehicle Type"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="Brand"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="Model"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                name="manufacture_year"
                type="number"
                value={form.manufacture_year}
                onChange={handleChange}
                placeholder="Manufacture Year"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                name="fuel_type"
                value={form.fuel_type}
                onChange={handleChange}
                placeholder="Fuel Type"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                name="capacity"
                type="number"
                value={form.capacity}
                onChange={handleChange}
                placeholder="Capacity"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                <option value="Available">Available</option>
                <option value="Assigned">Assigned</option>
                <option value="Maintenance">Maintenance</option>
                <option value="In Transit">In Transit</option>
              </select>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 text-slate-950 font-semibold rounded-lg hover:bg-cyan-400"
                >
                  {editingId ? "Update" : "Create"}
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