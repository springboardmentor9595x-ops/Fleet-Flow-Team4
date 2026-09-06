import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import {
  markAttendance,
  listAttendance,
  applyLeave,
  listLeaveRequests,
  reviewLeaveRequest,
  rateDriver,
  getDriverRatings,
} from "../api/attendance";
import { getDrivers } from "../api/drivers";

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function Attendance() {
  const { user } = useAuth();
  const rawRole = user?.role;
  const normalizedRole = typeof rawRole === "string"
    ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");

  const isAdminOrFm = normalizedRole === "admin" || normalizedRole === "fleetmanager";
  const isDispatcher = normalizedRole === "dispatcher";
  const isDriver = normalizedRole === "driver";
  const canMark = isAdminOrFm;

  // View state: "roster" (Daily Attendance), "leaves" (Leave Requests), "ratings" (Driver Ratings)
  const [activeTab, setActiveTab] = useState("roster");

  // Roster / Attendance State
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [attendances, setAttendances] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Shift Notes Modal (Existing)
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedDriverForNotes, setSelectedDriverForNotes] = useState(null);
  const [modalForm, setModalForm] = useState({
    status: "Present",
    notes: "",
  });

  // FEATURE 1: Leave Requests State
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_date: getLocalDateString(),
    end_date: "",
    reason: "",
  });
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRequestForReject, setSelectedRequestForReject] = useState(null);
  const [rejectionComment, setRejectionComment] = useState("");

  // FEATURE 2: Driver Ratings State
  const [driverRatings, setDriverRatings] = useState([]);
  const [showRateModal, setShowRateModal] = useState(false);
  const [selectedDriverForRating, setSelectedDriverForRating] = useState(null);
  const [rateFormDriverId, setRateFormDriverId] = useState("");
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [modalError, setModalError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [drvRes, attRes] = await Promise.all([
        getDrivers().catch(() => ({ data: [] })),
        listAttendance({ start_date: selectedDate, end_date: selectedDate }).catch(() => ({ data: [] })),
      ]);

      const driverList = drvRes.data || [];
      const attList = attRes.data || [];

      // If driver is logged in, filter to own profile
      if (isDriver) {
        const myDriver = driverList.find((d) => d.user_id === user?.user_id || d.email === user?.email);
        setDrivers(myDriver ? [myDriver] : driverList);
      } else {
        setDrivers(driverList);
      }

      setAttendances(attList);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  };

  const loadLeaveRequests = async () => {
    if (isDispatcher) return;
    try {
      const res = await listLeaveRequests();
      setLeaveRequests(res.data || []);
    } catch (err) {
      console.error("Failed to fetch leave requests", err);
    }
  };

  const loadRatings = async () => {
    if (isDispatcher) return;
    try {
      const res = await getDriverRatings();
      setDriverRatings(res.data || []);
    } catch (err) {
      console.error("Failed to fetch driver ratings", err);
    }
  };

  useEffect(() => {
    loadData();
    loadLeaveRequests();
    loadRatings();
  }, [selectedDate, user, activeTab]);

  // Build the complete attendance sheet for the selected date
  const attendanceSheet = drivers.map((d) => {
    const record = attendances.find((a) => a.driver_id === d.driver_id);
    return {
      driver_id: d.driver_id,
      driver_name: d.full_name || d.driver_name || "Driver",
      license_number: d.license_number || "—",
      date: selectedDate,
      status: record ? record.status : "NOT MARKED",
      notes: record ? record.notes || "—" : "—",
      recorded_at: record && record.created_at ? record.created_at : "—",
      attendance_id: record ? record.attendance_id : null,
      rawRecord: record || null,
    };
  });

  // Filter attendance sheet
  const filteredSheet = attendanceSheet.filter((row) => {
    const matchesSearch =
      !searchQuery ||
      row.driver_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.license_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      row.notes.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "NOT MARKED" && row.status === "NOT MARKED") ||
      row.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Metrics for selected date
  const totalDrivers = attendanceSheet.length;
  const presentCount = attendanceSheet.filter((r) => r.status === "Present").length;
  const absentCount = attendanceSheet.filter((r) => r.status === "Absent").length;
  const leaveCount = attendanceSheet.filter((r) => r.status === "Leave").length;
  const notMarkedCount = attendanceSheet.filter((r) => r.status === "NOT MARKED").length;
  const pendingLeavesCount = leaveRequests.filter((l) => l.status === "Pending").length;

  const handleQuickMark = async (driverId, newStatus, currentNotes = "") => {
    if (!canMark) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await markAttendance({
        driver_id: driverId,
        date: selectedDate,
        status: newStatus,
        notes: currentNotes === "—" ? "" : currentNotes,
      });
      setSuccess(`Updated attendance for driver to ${newStatus}`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to record attendance");
    } finally {
      setActionLoading(false);
    }
  };

  const openNotesModal = (row) => {
    setSelectedDriverForNotes(row);
    setModalForm({
      status: row.status === "NOT MARKED" ? "Present" : row.status,
      notes: row.notes === "—" ? "" : row.notes,
    });
    setShowNotesModal(true);
  };

  const handleNotesSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDriverForNotes) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await markAttendance({
        driver_id: selectedDriverForNotes.driver_id,
        date: selectedDate,
        status: modalForm.status,
        notes: modalForm.notes,
      });
      setSuccess("Attendance record saved successfully.");
      setShowNotesModal(false);
      setSelectedDriverForNotes(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update attendance notes");
    } finally {
      setActionLoading(false);
    }
  };

  // Leave Handlers
  const handleApplyLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!leaveForm.leave_date || !leaveForm.reason.trim()) {
      setModalError("Please specify a leave date and reason.");
      return;
    }
    setActionLoading(true);
    setError("");
    setModalError("");
    setSuccess("");
    try {
      await applyLeave({
        leave_date: leaveForm.leave_date,
        end_date: leaveForm.end_date || null,
        reason: leaveForm.reason.trim(),
      });
      setSuccess("Leave request submitted successfully with status PENDING.");
      setShowApplyLeaveModal(false);
      setModalError("");
      setLeaveForm({
        leave_date: getLocalDateString(),
        end_date: "",
        reason: "",
      });
      await loadLeaveRequests();
      setActiveTab("leaves");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to submit leave request.";
      setModalError(msg);
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveLeave = async (requestId) => {
    if (!isAdminOrFm) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const targetReq = leaveRequests.find((r) => r.request_id === requestId);
      await reviewLeaveRequest(requestId, { status: "Approved" });
      setSuccess("Leave request APPROVED. Driver attendance marked as LEAVE for the approved date.");
      if (targetReq && targetReq.leave_date) {
        setSelectedDate(targetReq.leave_date);
      }
      await loadLeaveRequests();
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to approve leave request.");
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (req) => {
    setSelectedRequestForReject(req);
    setRejectionComment("");
    setModalError("");
    setShowRejectModal(true);
  };

  const handleRejectLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRequestForReject) return;
    setActionLoading(true);
    setError("");
    setModalError("");
    setSuccess("");
    try {
      await reviewLeaveRequest(selectedRequestForReject.request_id, {
        status: "Rejected",
        manager_comment: rejectionComment.trim() || undefined,
      });
      setSuccess("Leave request REJECTED. Attendance was not altered.");
      setShowRejectModal(false);
      setSelectedRequestForReject(null);
      await loadLeaveRequests();
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to reject leave request.";
      setModalError(msg);
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Driver Rating Handlers
  const openRateModal = (driver = null) => {
    setSelectedDriverForRating(driver);
    setRateFormDriverId(driver ? driver.driver_id : (drivers[0]?.driver_id || ""));
    setRatingScore(5);
    setRatingComment("");
    setModalError("");
    setShowRateModal(true);
  };

  const handleRateSubmit = async (e) => {
    e.preventDefault();
    const targetDriverId = rateFormDriverId || selectedDriverForRating?.driver_id;
    if (!targetDriverId) {
      setModalError("Please select a driver to rate.");
      return;
    }
    setActionLoading(true);
    setError("");
    setModalError("");
    setSuccess("");
    try {
      await rateDriver({
        driver_id: targetDriverId,
        rating: Number(ratingScore),
        comment: ratingComment.trim() || null,
      });
      setSuccess(`Submitted ${ratingScore}-star rating successfully!`);
      setShowRateModal(false);
      setSelectedDriverForRating(null);
      setRateFormDriverId("");
      setRatingComment("");
      setRatingScore(5);
      await loadRatings();
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to submit driver rating.";
      setModalError(msg);
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status === "Present") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold";
    } else if (status === "Leave" || status === "Approved") {
      return "bg-amber-50 text-amber-700 border border-amber-200 font-bold";
    } else if (status === "Absent" || status === "Rejected") {
      return "bg-rose-50 text-rose-700 border border-rose-200 font-bold";
    } else if (status === "Pending") {
      return "bg-amber-50 text-amber-800 border border-amber-300 font-bold animate-pulse";
    } else {
      return "bg-slate-100 text-slate-600 border border-slate-200 font-semibold";
    }
  };

  const getRatingStars = (num) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={i <= Math.round(num) ? "text-amber-500" : "text-slate-300"}>
          ★
        </span>
      );
    }
    return stars;
  };

  const RATING_DESCRIPTIONS = {
    1: "1 = Very Poor",
    2: "2 = Poor",
    3: "3 = Average",
    4: "4 = Good",
    5: "5 = Excellent",
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Driver Attendance & Personnel</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-blue-600 uppercase mt-1">
              DAILY ROSTER, LEAVE APPROVAL WORKFLOW & FLEET DRIVER PERFORMANCE
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Apply Leave for Driver */}
            {isDriver && (
              <button
                onClick={() => setShowApplyLeaveModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold font-mono rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <span>📝</span>
                <span>Apply Leave</span>
              </button>
            )}

            <button
              onClick={() => {
                loadData();
                loadLeaveRequests();
                loadRatings();
              }}
              disabled={loading || actionLoading}
              className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition flex items-center gap-2"
              title="Refresh Attendance Data"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              <span>Refresh</span>
            </button>

            <span className="text-xs font-mono text-slate-500">
              OPERATOR: <strong className="text-slate-700">{user?.full_name?.toUpperCase()} ({user?.role?.toUpperCase()})</strong>
            </span>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>✅ {success}</span>
            <button onClick={() => setSuccess("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab("roster")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "roster"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <span>📅</span>
            <span>Daily Attendance Roster</span>
          </button>

          {!isDispatcher && (
            <button
              onClick={() => setActiveTab("leaves")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === "leaves"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>📝</span>
              <span>{isDriver ? "My Leave Requests" : "Leave Requests"}</span>
              {pendingLeavesCount > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === "leaves" ? "bg-white text-blue-600" : "bg-amber-500 text-white"
                }`}>
                  {pendingLeavesCount}
                </span>
              )}
            </button>
          )}

          {!isDispatcher && (
            <button
              onClick={() => setActiveTab("ratings")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                activeTab === "ratings"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>⭐</span>
              <span>{isDriver ? "My Driver Rating" : "Driver Star Ratings"}</span>
            </button>
          )}
        </div>

        {/* ================================================================= */}
        {/* TAB 1: DAILY ATTENDANCE ROSTER (100% UNTOUCHED ORIGINAL DESIGN)   */}
        {/* ================================================================= */}
        {activeTab === "roster" && (
          <div className="space-y-6">
            {/* Metric KPI Summary Cards for Selected Date */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">TOTAL DRIVERS</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalDrivers}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">ROSTER ON {selectedDate}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">PRESENT</p>
                <p className="text-2xl font-extrabold text-emerald-600 mt-1">{presentCount}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">ON DUTY</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-mono text-rose-600 font-bold uppercase tracking-wider">ABSENT</p>
                <p className="text-2xl font-extrabold text-rose-600 mt-1">{absentCount}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">UNEXCUSED</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">ON LEAVE</p>
                <p className="text-2xl font-extrabold text-amber-600 mt-1">{leaveCount}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">APPROVED LEAVE</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-mono text-slate-600 font-bold uppercase tracking-wider">NOT MARKED</p>
                <p className="text-2xl font-extrabold text-slate-600 mt-1">{notMarkedCount}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">PENDING INPUT</p>
              </div>
            </div>

            {/* Date Selector & Search Toolbar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-blue-50/60 border border-blue-200 px-3 py-1.5 rounded-xl">
                  <span className="font-bold text-blue-900 font-mono">📅 ATTENDANCE DATE:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-white border border-blue-200 rounded-lg px-2.5 py-1 text-slate-900 font-bold font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-semibold focus:outline-none focus:border-blue-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Leave">Leave</option>
                  <option value="NOT MARKED">Not Marked</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search driver name, license, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 placeholder-slate-400 w-64 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Attendance Records Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">DRIVER NAME</th>
                      <th className="p-4">LICENSE NUMBER</th>
                      <th className="p-4">DATE</th>
                      <th className="p-4">STATUS</th>
                      <th className="p-4">NOTES / SHIFT DETAILS</th>
                      <th className="p-4">RECORDED AT</th>
                      {canMark && <th className="p-4 text-right">MARK ATTENDANCE</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {loading ? (
                      <tr>
                        <td colSpan={canMark ? 7 : 6} className="p-12 text-center text-slate-400 font-mono">
                          <span className="animate-spin inline-block mr-2">🔄</span> Loading attendance logs for {selectedDate}...
                        </td>
                      </tr>
                    ) : filteredSheet.length === 0 ? (
                      <tr>
                        <td colSpan={canMark ? 7 : 6} className="p-12 text-center text-slate-400 font-mono">
                          No drivers found in the system.
                        </td>
                      </tr>
                    ) : (
                      filteredSheet.map((row) => (
                        <tr key={row.driver_id} className="hover:bg-slate-50 transition">
                          <td className="p-4 font-sans font-bold text-slate-900">
                            {row.driver_name}
                          </td>
                          <td className="p-4 text-blue-600 font-semibold">
                            {row.license_number}
                          </td>
                          <td className="p-4 font-bold text-slate-700">
                            {row.date}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase ${getStatusBadge(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="p-4 font-sans text-slate-600 max-w-xs truncate">
                            {row.notes}
                          </td>
                          <td className="p-4 text-slate-400">
                            {row.recorded_at !== "—" ? row.recorded_at.slice(0, 19).replace("T", " ") : "—"}
                          </td>
                          {canMark && (
                            <td className="p-4 text-right space-x-1.5 font-sans">
                              <button
                                onClick={() => handleQuickMark(row.driver_id, "Present", row.notes)}
                                disabled={actionLoading}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                                  row.status === "Present"
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                    : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                                }`}
                                title="Mark Present"
                              >
                                ✓ Present
                              </button>
                              <button
                                onClick={() => handleQuickMark(row.driver_id, "Absent", row.notes)}
                                disabled={actionLoading}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                                  row.status === "Absent"
                                    ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                    : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                                }`}
                                title="Mark Absent"
                              >
                                ✗ Absent
                              </button>
                              <button
                                onClick={() => handleQuickMark(row.driver_id, "Leave", row.notes)}
                                disabled={actionLoading}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border ${
                                  row.status === "Leave"
                                    ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                    : "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200"
                                }`}
                                title="Mark Leave"
                              >
                                ⏳ Leave
                              </button>
                              <button
                                onClick={() => openNotesModal(row)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold transition"
                                title="Edit Details / Shift Notes"
                              >
                                📝 Notes
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: FEATURE 1 — DRIVER LEAVE REQUESTS / PERMISSION            */}
        {/* ================================================================= */}
        {activeTab === "leaves" && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isDriver ? "My Leave Requests & Permissions" : "Fleet Driver Leave Requests"}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {isDriver
                    ? "Submit leave applications for manager review and track permission status"
                    : "Review, approve or reject driver leave applications"}
                </p>
              </div>

              {isDriver && (
                <button
                  onClick={() => setShowApplyLeaveModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold font-mono rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Apply New Leave</span>
                </button>
              )}
            </div>

            {/* Leave Requests Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-4">DRIVER NAME</th>
                      <th className="p-4">LICENSE #</th>
                      <th className="p-4">LEAVE DATE</th>
                      <th className="p-4">REASON FOR LEAVE</th>
                      <th className="p-4">REQUESTED AT</th>
                      <th className="p-4">STATUS</th>
                      <th className="p-4">MANAGER RESPONSE</th>
                      {isAdminOrFm && <th className="p-4 text-right">ACTIONS</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {leaveRequests.length === 0 ? (
                      <tr>
                        <td colSpan={isAdminOrFm ? 8 : 7} className="p-12 text-center text-slate-400 font-mono">
                          No leave requests found.
                        </td>
                      </tr>
                    ) : (
                      leaveRequests.map((req) => (
                        <tr key={req.request_id} className="hover:bg-slate-50 transition">
                          <td className="p-4 font-sans font-bold text-slate-900">
                            {req.driver_name}
                          </td>
                          <td className="p-4 text-blue-600 font-semibold">
                            {req.license_number || "—"}
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            {req.leave_date}
                            {req.end_date && req.end_date !== req.leave_date ? ` to ${req.end_date}` : ""}
                          </td>
                          <td className="p-4 font-sans text-slate-700 max-w-xs truncate" title={req.reason}>
                            {req.reason}
                          </td>
                          <td className="p-4 text-slate-400">
                            {req.created_at ? req.created_at.slice(0, 19).replace("T", " ") : "—"}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase ${getStatusBadge(req.status)}`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="p-4 font-sans text-slate-600">
                            {req.manager_comment ? (
                              <span className="italic text-slate-700">"{req.manager_comment}"</span>
                            ) : req.status === "Approved" ? (
                              <span className="text-emerald-600 font-semibold">Approved by {req.reviewer_name || "Manager"}</span>
                            ) : req.status === "Rejected" ? (
                              <span className="text-rose-600 font-semibold">Rejected without note</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          {isAdminOrFm && (
                            <td className="p-4 text-right space-x-2 font-sans">
                              {String(req.status).toLowerCase() === "pending" ? (
                                <>
                                  <button
                                    onClick={() => handleApproveLeave(req.request_id)}
                                    disabled={actionLoading}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
                                    title="Approve Leave and Mark Attendance"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    onClick={() => openRejectModal(req)}
                                    disabled={actionLoading}
                                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition"
                                    title="Reject Leave Request"
                                  >
                                    ✗ Reject
                                  </button>
                                </>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Resolved ({req.status})
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: FEATURE 2 — DRIVER STAR RATINGS                            */}
        {/* ================================================================= */}
        {activeTab === "ratings" && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isDriver ? "My Driver Rating & Performance Reviews" : "Driver Star Ratings & Quality Index"}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {isDriver
                    ? "View your 1–5 star rating average and feedback comments submitted by management"
                    : "Rate driver performance on a 1–5 star scale with quality feedback reviews"}
                </p>
              </div>

              {isAdminOrFm && (
                <button
                  onClick={() => openRateModal(null)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold font-mono rounded-xl shadow-sm transition flex items-center gap-1.5"
                >
                  <span>⭐</span>
                  <span>Rate a Driver</span>
                </button>
              )}
            </div>

            {/* Driver Personal View */}
            {isDriver && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-3xl font-black text-amber-600">
                    ⭐
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-slate-900">
                      {driverRatings[0]?.average_rating !== undefined ? driverRatings[0].average_rating : "0.0"} / 5.0
                    </h4>
                    <div className="flex items-center gap-2 text-sm mt-0.5">
                      <div className="flex">{getRatingStars(driverRatings[0]?.average_rating || 0)}</div>
                      <span className="text-xs font-mono text-slate-500">
                        Based on {driverRatings[0]?.total_reviews || 0} review{driverRatings[0]?.total_reviews !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h5 className="text-xs font-bold font-mono text-slate-700 uppercase">Recent Performance Reviews</h5>
                  {(!driverRatings[0]?.reviews || driverRatings[0].reviews.length === 0) ? (
                    <p className="text-xs text-slate-400 font-mono">No feedback reviews recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {driverRatings[0].reviews.map((rev) => (
                        <div key={rev.rating_id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">{getRatingStars(rev.rating)}</span>
                              <span className="font-mono text-slate-600">({rev.rating}/5)</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {rev.created_at ? rev.created_at.slice(0, 10) : ""}
                            </span>
                          </div>
                          {rev.comment && <p className="text-xs text-slate-700 italic">"{rev.comment}"</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fleet Manager / Admin View: Drivers Ratings Table */}
            {isAdminOrFm && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-4">DRIVER NAME</th>
                        <th className="p-4">LICENSE NUMBER</th>
                        <th className="p-4">AVERAGE RATING</th>
                        <th className="p-4">NUMBER OF REVIEWS</th>
                        <th className="p-4">LATEST REVIEW</th>
                        <th className="p-4 text-right">RATE DRIVER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {driverRatings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-12 text-center text-slate-400 font-mono">
                            No drivers available for rating.
                          </td>
                        </tr>
                      ) : (
                        driverRatings.map((drv) => (
                          <tr key={drv.driver_id} className="hover:bg-slate-50 transition">
                            <td className="p-4 font-sans font-bold text-slate-900">
                              {drv.driver_name}
                            </td>
                            <td className="p-4 text-blue-600 font-semibold">
                              {drv.license_number || "—"}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{getRatingStars(drv.average_rating)}</span>
                                <span className="font-bold text-slate-800">{drv.average_rating}</span>
                              </div>
                            </td>
                            <td className="p-4 text-slate-700">
                              <span className="px-2.5 py-1 bg-slate-100 rounded-full font-bold">
                                {drv.total_reviews} review{drv.total_reviews !== 1 ? "s" : ""}
                              </span>
                            </td>
                            <td className="p-4 font-sans text-slate-600 max-w-xs truncate">
                              {drv.reviews && drv.reviews.length > 0 ? (
                                <span title={drv.reviews[0].comment}>
                                  "{drv.reviews[0].comment || `Rated ${drv.reviews[0].rating} stars`}"
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-4 text-right font-sans">
                              <button
                                onClick={() => openRateModal(drv)}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1 ml-auto"
                              >
                                <span>⭐</span>
                                <span>Rate Driver</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Apply for Leave (Driver) */}
        {showApplyLeaveModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Apply for Leave</h3>
                  <p className="text-xs font-mono text-slate-500">Submit leave request for management approval</p>
                </div>
                <button
                  onClick={() => setShowApplyLeaveModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl">
                  ⚠️ {modalError}
                </div>
              )}

              <form onSubmit={handleApplyLeaveSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Leave Date (From) <span className="text-blue-600">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={leaveForm.leave_date}
                      onChange={(e) => setLeaveForm({ ...leaveForm, leave_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">To Date (Optional)</label>
                    <input
                      type="date"
                      value={leaveForm.end_date}
                      onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Reason for Leave <span className="text-blue-600">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Medical appointment, personal family emergency..."
                    value={leaveForm.reason}
                    onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-sans"
                  />
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-[11px] text-blue-800 font-mono">
                  ℹ️ Request will be submitted as <strong>PENDING</strong>. Your attendance status will only reflect LEAVE upon manager approval.
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowApplyLeaveModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Submitting..." : "Submit Leave Request"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Reject Leave Request with Optional Reason (Fleet Manager) */}
        {showRejectModal && selectedRequestForReject && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Reject Leave Request</h3>
                  <p className="text-xs font-mono text-slate-500">
                    Driver: {selectedRequestForReject.driver_name} ({selectedRequestForReject.leave_date})
                  </p>
                </div>
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl">
                  ⚠️ {modalError}
                </div>
              )}

              <form onSubmit={handleRejectLeaveSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Reason for Rejection (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Critical route assignment scheduled, high shipment volume day..."
                    value={rejectionComment}
                    onChange={(e) => setRejectionComment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-sans"
                  />
                </div>

                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-800 font-mono">
                  ⚠️ Rejecting this request will mark the request status as REJECTED. The driver's attendance will NOT be marked as leave.
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowRejectModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Rejecting..." : "Confirm Rejection"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Rate Driver with 1-5 Star Selector (Fleet Manager) */}
        {showRateModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Rate Driver Performance</h3>
                  <p className="text-xs font-mono text-slate-500">
                    {selectedDriverForRating ? `${selectedDriverForRating.driver_name || selectedDriverForRating.full_name} (${selectedDriverForRating.license_number || "—"})` : "Select a driver to submit star rating"}
                  </p>
                </div>
                <button
                  onClick={() => setShowRateModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl">
                  ⚠️ {modalError}
                </div>
              )}

              <form onSubmit={handleRateSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Select Driver <span className="text-blue-600">*</span>
                  </label>
                  <select
                    required
                    value={rateFormDriverId}
                    onChange={(e) => {
                      setRateFormDriverId(e.target.value);
                      const drv = drivers.find((d) => d.driver_id === e.target.value) || driverRatings.find((d) => d.driver_id === e.target.value);
                      setSelectedDriverForRating(drv);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="">-- Choose Driver --</option>
                    {(driverRatings.length > 0 ? driverRatings : drivers).map((d) => (
                      <option key={d.driver_id} value={d.driver_id}>
                        {d.driver_name || d.full_name || "Driver"} ({d.license_number || "—"})
                      </option>
                    ))}
                  </select>
                </div>
                {/* 1-5 Star Selector */}
                <div className="text-center py-2 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <label className="block text-slate-700 font-bold text-xs uppercase tracking-wider">
                    Select Star Rating
                  </label>
                  <div className="flex items-center justify-center gap-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setRatingScore(star)}
                        className={`text-3xl transition transform hover:scale-125 focus:outline-none ${
                          star <= ratingScore ? "text-amber-500 drop-shadow-sm" : "text-slate-300"
                        }`}
                        title={RATING_DESCRIPTIONS[star]}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-bold text-blue-600 font-mono">
                    {RATING_DESCRIPTIONS[ratingScore]}
                  </p>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Review / Performance Comment (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Good driving, punctual delivery, maintained vehicle in clean condition..."
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-sans"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowRateModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Submitting..." : "Save Rating"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Shift Notes & Status (Existing) */}
        {showNotesModal && selectedDriverForNotes && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Driver Attendance Details</h3>
                  <p className="text-xs font-mono text-slate-500">
                    {selectedDriverForNotes.driver_name} ({selectedDriverForNotes.license_number})
                  </p>
                </div>
                <button
                  onClick={() => setShowNotesModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleNotesSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Attendance Date
                  </label>
                  <input
                    type="date"
                    disabled
                    value={selectedDate}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-mono cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Attendance Status <span className="text-blue-600">*</span>
                  </label>
                  <select
                    required
                    value={modalForm.status}
                    onChange={(e) => setModalForm({ ...modalForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="Present">Present (On Duty)</option>
                    <option value="Absent">Absent (Unexcused)</option>
                    <option value="Leave">Leave (Approved)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Shift Notes / Remarks</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Assigned to North Route morning shift, or medical leave reported..."
                    value={modalForm.notes}
                    onChange={(e) => setModalForm({ ...modalForm, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 font-sans"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowNotesModal(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-sm disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : "Save Attendance"}
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
