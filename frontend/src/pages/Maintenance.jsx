import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { getMaintenance, createMaintenance, updateMaintenance, deleteMaintenance } from "../api/maintenance";
import { getVehicles } from "../api/vehicles";
import { getOverdueMaintenance } from "../api/notifications";

const emptyForm = {
  vehicle_id: "",
  maintenance_type: "General Inspection",
  scheduled_date: new Date().toISOString().split("T")[0],
  description: "",
  cost: 0,
  status: "Scheduled",
};

const STATUS_BADGE_STYLES = {
  Scheduled: "bg-amber-50 text-amber-700 border-amber-200 font-bold",
  "In Progress": "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/40 font-bold",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200 font-bold",
};

export default function MaintenancePage() {
  const { user } = useAuth();
  const rawRole = user?.role;
  const normalizedRole = typeof rawRole === "string"
    ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");

  const canManage = normalizedRole === "admin" || normalizedRole === "fleetmanager";

  // records = non-overdue active/scheduled records shown in the main table
  const [records, setRecords] = useState([]);
  // overdueNotifications = overdue records fetched from /notifications/overdue-maintenance
  const [overdueNotifications, setOverdueNotifications] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showBellPanel, setShowBellPanel] = useState(false);
  const [bellFilter, setBellFilter] = useState("OVERDUE");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [mRes, overdueRes, vRes] = await Promise.all([
        getMaintenance().catch(() => ({ data: [] })),
        getOverdueMaintenance().catch(() => ({ data: [] })),
        getVehicles().catch(() => ({ data: [] })),
      ]);
      setRecords(mRes.data || []);
      setOverdueNotifications(overdueRes.data || []);
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

  // Filtered maintenance records (main table — non-overdue, active scheduled only)
  const filteredRecords = records.filter((r) => {
    // Defense-in-depth: Never show overdue or completed records in the main maintenance table
    if (r.is_overdue || r.status === "Completed" || r.status === "Resolved" || r.status === "Cancelled") {
      return false;
    }

    const matchesSearch =
      !searchQuery ||
      r.registration_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.vehicle_registration?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "All" || r.maintenance_type === typeFilter;
    const matchesStatus = statusFilter === "All" || r.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Accurate Metrics calculations
  // records = non-overdue scheduled/active; overdueNotifications = overdue
  const totalRecords = records.length;
  const scheduledCount = records.filter((r) => r.status === "Scheduled").length;
  const inProgressCount = records.filter((r) => r.status === "In Progress").length;
  const completedCount = records.filter((r) => r.status === "Completed" || r.status === "Resolved").length;
  const pendingCount = records.filter((r) => r.status === "Scheduled" || r.status === "In Progress").length;

  const overdueCount = overdueNotifications.length;
  const dueSoonRecords = records.filter((r) => r.is_upcoming && r.status !== "Completed" && r.status !== "Cancelled" && r.status !== "Resolved");
  const dueSoonCount = dueSoonRecords.length;
  // Bell badge shows overdue count (primary alert)
  const totalAlertBadgeCount = overdueCount + dueSoonCount;

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_id) {
      setError("Please select a vehicle");
      return;
    }
    setActionLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      await createMaintenance(form);
      setShowAddModal(false);
      setForm(emptyForm);
      setSuccessMsg("Maintenance schedule created successfully!");
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
    setSuccessMsg("");
    try {
      await updateMaintenance(editingRecord.maintenance_id || editingRecord.id, form);
      setShowEditModal(false);
      setEditingRecord(null);
      setForm(emptyForm);
      setSuccessMsg("Maintenance record updated successfully!");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update maintenance record");
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickComplete = async (recordId) => {
    setActionLoading(true);
    setError("");
    try {
      await updateMaintenance(recordId, { status: "Completed" });
      setSuccessMsg("Maintenance marked as Completed! Vehicle status restored to Available.");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to complete maintenance");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setActionLoading(true);
    setError("");
    try {
      await deleteMaintenance(id);
      setDeleteConfirm(null);
      setSuccessMsg("Maintenance record removed.");
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
      description: r.description || r.remarks || "",
      cost: r.cost || 0,
      status: r.status || "Scheduled",
    });
    setShowEditModal(true);
  };

  // Notification items for the Bell dropdown panel
  // OVERDUE tab: from overdueNotifications (records with past due dates, kept in DB but NOT in main table)
  // Other tabs: from records (non-overdue active records)
  const bellItems = (() => {
    if (bellFilter === "OVERDUE") return overdueNotifications;
    if (bellFilter === "DUE_SOON") return records.filter((r) => r.is_upcoming && r.status !== "Completed" && r.status !== "Resolved");
    if (bellFilter === "PENDING") return records.filter((r) => r.status === "Scheduled" || r.status === "In Progress");
    if (bellFilter === "COMPLETED") return records.filter((r) => r.status === "Completed" || r.status === "Resolved");
    // ALL = overdue + non-overdue records
    return [...overdueNotifications, ...records];
  })();

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto relative">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Maintenance</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-blue-600 uppercase mt-1">
              SCHEDULE AND TRACK VEHICLE SERVICE, REPAIRS AND HEALTH
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Maintenance Bell Notification Icon */}
            <div className="relative">
              <button
                onClick={() => setShowBellPanel(!showBellPanel)}
                className="relative px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2"
                title="Maintenance Notification Center"
              >
                <span className="text-sm">🔔</span>
                <span className="font-bold">Alerts</span>
                {totalAlertBadgeCount > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white animate-pulse">
                    {totalAlertBadgeCount}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                    {pendingCount}
                  </span>
                )}
              </button>

              {/* Maintenance Notification Dropdown Panel */}
              {showBellPanel && (
                <div className="absolute right-0 mt-2 w-96 sm:w-[460px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-4 space-y-4 max-h-[580px] overflow-y-auto">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span>🔔</span> Maintenance Alerts & Schedule
                      </h4>
                      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                        REAL-TIME SERVICE & EMAIL STATUS
                      </p>
                    </div>
                    <button
                      onClick={() => setShowBellPanel(false)}
                      className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 5 Notification Summary Counters */}
                  <div className="grid grid-cols-5 gap-1.5 text-center">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2">
                      <p className="text-[9px] font-mono font-bold text-slate-500 uppercase">SCHEDULED</p>
                      <p className="text-base font-extrabold text-amber-600 mt-0.5">{scheduledCount}</p>
                    </div>
                    <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-2">
                      <p className="text-[9px] font-mono font-bold text-amber-700 uppercase">DUE SOON</p>
                      <p className="text-base font-extrabold text-amber-700 mt-0.5">{dueSoonCount}</p>
                    </div>
                    <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-2">
                      <p className="text-[9px] font-mono font-bold text-rose-700 uppercase">OVERDUE</p>
                      <p className="text-base font-extrabold text-rose-700 mt-0.5">{overdueCount}</p>
                    </div>
                    <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-2">
                      <p className="text-[9px] font-mono font-bold text-emerald-700 uppercase">DONE</p>
                      <p className="text-base font-extrabold text-emerald-700 mt-0.5">{completedCount}</p>
                    </div>
                    <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-2">
                      <p className="text-[9px] font-mono font-bold text-blue-700 uppercase">PENDING</p>
                      <p className="text-base font-extrabold text-blue-700 mt-0.5">{pendingCount}</p>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex border-b border-slate-100 gap-1 pb-1">
                    {[
                      { key: "ALL", label: `All (${overdueNotifications.length + records.length})` },
                      { key: "OVERDUE", label: `Overdue (${overdueCount})` },
                      { key: "DUE_SOON", label: `Due (${dueSoonCount})` },
                      { key: "PENDING", label: `Pending (${pendingCount})` },
                      { key: "COMPLETED", label: `Done (${completedCount})` },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setBellFilter(tab.key)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition ${
                          bellFilter === tab.key
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Scheduled Items List */}
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {bellItems.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 font-mono">
                        No maintenance items found in this filter.
                      </div>
                    ) : (
                      bellItems.map((item) => {
                        const isOverdue = item.is_overdue && item.status !== "Completed" && item.status !== "Resolved";
                        const isDueSoon = item.is_upcoming && item.status !== "Completed" && item.status !== "Resolved";
                        const emailStatus = item.email_status || (item.notification_count > 0 ? "Sent" : "Pending");

                        return (
                          <div
                            key={item.maintenance_id || item.id}
                            className={`p-3 rounded-xl border transition space-y-2 ${
                              isOverdue
                                ? "bg-rose-50/30 border-rose-200"
                                : isDueSoon
                                ? "bg-amber-50/30 border-amber-200"
                                : "bg-slate-50/50 border-slate-200"
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isOverdue && (
                                    <span className="text-[9px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1 py-0.5 rounded">
                                      Maintenance Overdue
                                    </span>
                                  )}
                                  <span className="text-xs font-bold text-slate-900">
                                    {item.registration_number || item.vehicle_registration || "Vehicle"}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  ({item.brand || ""} {item.model || ""})
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] border font-bold ${
                                  isOverdue
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : STATUS_BADGE_STYLES[item.status] || "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {isOverdue ? "OVERDUE" : item.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-400 font-mono">Type: </span>
                                <span className="font-semibold text-slate-700">{item.maintenance_type}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-mono">Scheduled: </span>
                                <span className="font-mono text-slate-700">{item.scheduled_date || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-mono">Due Date: </span>
                                <span className={`font-mono font-bold ${isOverdue ? "text-rose-600" : "text-slate-700"}`}>
                                  {item.due_date || (item.service_date ? item.service_date.slice(0, 10) : item.scheduled_date || "N/A")}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-mono">Email: </span>
                                {emailStatus === "Sent" ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ✓ Email Sent
                                  </span>
                                ) : emailStatus === "Failed" ? (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    ✗ Failed
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    ⏳ Pending
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Quick Complete Action inside Notification Item */}
                            {canManage && item.status !== "Completed" && item.status !== "Resolved" && item.status !== "Cancelled" && (
                              <div className="pt-1 flex justify-end">
                                <button
                                  onClick={() => handleQuickComplete(item.maintenance_id || item.id)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition"
                                >
                                  ✓ Mark as Completed
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={loadData}
              className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2"
            >
              🔄 Refresh
            </button>
            <span className="text-xs font-mono text-slate-500">
              OPERATOR: <strong className="text-slate-700">{user?.full_name?.toUpperCase()} ({user?.role?.toUpperCase()})</strong>
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

        {/* 4 Summary Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5">🛠️</div>
            <p className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">TOTAL RECORDS</p>
            <h3 className="text-3xl font-extrabold text-slate-900 mt-1">{totalRecords}</h3>
            <p className="text-[10px] text-slate-400 mt-2 font-mono">ALL SERVICE LOGS</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-amber-500">📅</div>
            <p className="text-[10px] text-amber-600 font-mono font-bold uppercase tracking-wider">SCHEDULED</p>
            <h3 className="text-3xl font-extrabold text-amber-600 mt-1">{scheduledCount}</h3>
            <p className="text-[10px] text-slate-400 mt-2 font-mono">UPCOMING SERVICE</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-[#0F766E]">⚙️</div>
            <p className="text-[10px] text-[#0F766E] font-mono font-bold uppercase tracking-wider">IN PROGRESS</p>
            <h3 className="text-3xl font-extrabold text-[#0F766E] mt-1">{inProgressCount}</h3>
            <p className="text-[10px] text-slate-400 mt-2 font-mono">CURRENTLY SERVICING</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
            <div className="absolute -right-2 -bottom-2 text-6xl opacity-5 text-emerald-500">✅</div>
            <p className="text-[10px] text-emerald-600 font-mono font-bold uppercase tracking-wider">COMPLETED</p>
            <h3 className="text-3xl font-extrabold text-emerald-600 mt-1">{completedCount}</h3>
            <p className="text-[10px] text-slate-400 mt-2 font-mono">SERVICE COMPLETED</p>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <input
              type="text"
              placeholder="Search by vehicle registration, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400 w-full sm:w-72"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-400"
            >
              <option value="All">All Types</option>
              <option value="General Inspection">General Inspection</option>
              <option value="Oil Change">Oil Change</option>
              <option value="Tyre Replacement">Tyre Replacement</option>
              <option value="Tire Replacement">Tire Replacement</option>
              <option value="Engine Service">Engine Service</option>
              <option value="Brake Service">Brake Service</option>
              <option value="Transmission Check">Transmission Check</option>
              <option value="Repair">Repair</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-400"
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
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition flex items-center gap-2"
            >
              <span>+ Schedule Maintenance</span>
            </button>
          )}
        </div>

        {/* Maintenance Table View */}
        {loading ? (
          <div className="p-12 text-center text-slate-500 font-mono text-sm">Loading Maintenance Records...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-500 text-sm font-mono">
            {normalizedRole === "driver" && !user?.assigned_vehicle ? (
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-700">No vehicle assigned</p>
                <p className="text-xs text-slate-400">You currently have no vehicle assigned to your account. Contact your Fleet Manager.</p>
              </div>
            ) : normalizedRole === "driver" && user?.assigned_vehicle ? (
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-700">No maintenance records found</p>
                <p className="text-xs text-slate-400">There are no active scheduled maintenance records for your assigned vehicle ({user.assigned_vehicle.registration_number}).</p>
              </div>
            ) : (
              "No maintenance records found."
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                    <th className="p-4">MAINTENANCE ID</th>
                    <th className="p-4">VEHICLE REG NO.</th>
                    <th className="p-4">VEHICLE MODEL</th>
                    <th className="p-4">MAINTENANCE TYPE</th>
                    <th className="p-4">SCHEDULED DATE</th>
                    <th className="p-4">EMAIL ALERT</th>
                    <th className="p-4">COST (₹)</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4">DESCRIPTION</th>
                    <th className="p-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((r) => {
                    const emailStatus = r.email_status || (r.notification_count > 0 ? "Sent" : "Pending");
                    const isCompleted = r.status === "Completed" || r.status === "Resolved";

                    return (
                      <tr key={r.maintenance_id || r.id} className="hover:bg-slate-50 transition">
                        <td className="p-4 font-mono text-blue-600 font-semibold">
                          MNT-{(r.maintenance_id || r.id).slice(0, 6).toUpperCase()}
                        </td>
                        <td className="p-4 font-bold text-slate-900">
                          {r.registration_number || r.vehicle_registration}
                        </td>
                        <td className="p-4 text-slate-600">
                          {r.model || `${r.brand || ''}`}
                        </td>
                        <td className="p-4 font-semibold text-slate-700">
                          {r.maintenance_type}
                        </td>
                        <td className="p-4 font-mono text-slate-500">
                          {r.scheduled_date}
                        </td>
                        <td className="p-4">
                          {emailStatus === "Sent" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ✓ Email Sent
                            </span>
                          ) : emailStatus === "Failed" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              ✗ Failed
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              ⏳ Pending
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-emerald-700 font-bold">
                          ₹{r.cost ? r.cost.toLocaleString() : "0"}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] border ${STATUS_BADGE_STYLES[r.status] || "bg-slate-100 text-slate-600"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 max-w-[180px] truncate">
                          {r.description || r.remarks || "-"}
                        </td>
                        <td className="p-4 text-right space-x-1.5">
                          {canManage && (
                            <>
                              {!isCompleted && r.status !== "Cancelled" && (
                                <button
                                  onClick={() => handleQuickComplete(r.maintenance_id || r.id)}
                                  disabled={actionLoading}
                                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-semibold transition"
                                  title="Mark Completed"
                                >
                                  ✓ Complete
                                </button>
                              )}
                              <button
                                onClick={() => openEdit(r)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-semibold transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(r)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-semibold transition"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Schedule Maintenance */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <h3 className="text-lg font-bold text-slate-900">+ Schedule Maintenance</h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Select Vehicle *</label>
                  <select
                    required
                    value={form.vehicle_id}
                    onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
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
                  <label className="block text-slate-600 mb-1 font-semibold">Maintenance Type</label>
                  <select
                    value={form.maintenance_type}
                    onChange={(e) => setForm({ ...form, maintenance_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  >
                    <option value="General Inspection">General Inspection</option>
                    <option value="Oil Change">Oil Change</option>
                    <option value="Tire Replacement">Tire Replacement</option>
                    <option value="Engine Service">Engine Service</option>
                    <option value="Brake Service">Brake Service</option>
                    <option value="Transmission Check">Transmission Check</option>
                    <option value="Repair">Repair</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Scheduled Date</label>
                    <input
                      type="date"
                      value={form.scheduled_date}
                      onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Estimated Cost (₹)</label>
                    <input
                      type="number"
                      placeholder="4500"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Initial Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Description / Remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Provide details about the vehicle issue or routine service..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
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
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 text-xs"
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
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <h3 className="text-lg font-bold text-slate-900">Update Maintenance Record</h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-700">✕</button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Maintenance Type</label>
                  <select
                    value={form.maintenance_type}
                    onChange={(e) => setForm({ ...form, maintenance_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  >
                    <option value="General Inspection">General Inspection</option>
                    <option value="Oil Change">Oil Change</option>
                    <option value="Tire Replacement">Tire Replacement</option>
                    <option value="Engine Service">Engine Service</option>
                    <option value="Brake Service">Brake Service</option>
                    <option value="Transmission Check">Transmission Check</option>
                    <option value="Repair">Repair</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Scheduled Date</label>
                    <input
                      type="date"
                      value={form.scheduled_date}
                      onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Cost (₹)</label>
                    <input
                      type="number"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-400"
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed (Restores Vehicle to Available)</option>
                    <option value="Cancelled">Cancelled (Restores Vehicle to Available)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-semibold">Description / Remarks</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
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
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 text-xs"
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
              <h3 className="text-base font-bold text-slate-900">Delete Maintenance Record?</h3>
              <p className="text-xs text-slate-600">
                Are you sure you want to delete maintenance record <strong className="text-slate-900">MNT-{(deleteConfirm.maintenance_id || deleteConfirm.id).slice(0, 6).toUpperCase()}</strong>?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs rounded-xl hover:bg-slate-200 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.maintenance_id || deleteConfirm.id)}
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
