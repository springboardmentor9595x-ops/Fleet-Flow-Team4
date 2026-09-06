import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import {
  getFleetUtilizationReport,
  getFuelConsumptionReport,
  getDriverPerformanceReport,
  getDeliveryPerformanceReport,
  getMaintenanceReport,
  downloadReportFile,
} from "../api/reports";

export default function Reports() {
  const { user } = useAuth();
  const role = user?.role || "Driver";

  // Determine available reports based on role matrix
  const getAvailableReports = () => {
    if (role === "Admin" || role === "FleetManager") {
      return [
        { id: "fleet-utilization", name: "🚚 Fleet Utilization", endpoint: "/reports/fleet-utilization", fn: getFleetUtilizationReport },
        { id: "fuel-consumption", name: "⛽ Fuel Consumption & Efficiency", endpoint: "/reports/fuel-consumption", fn: getFuelConsumptionReport },
        { id: "driver-performance", name: "👤 Driver Performance & Attendance", endpoint: "/reports/driver-performance", fn: getDriverPerformanceReport },
        { id: "delivery-performance", name: "📦 Delivery Performance", endpoint: "/reports/delivery-performance", fn: getDeliveryPerformanceReport },
        { id: "maintenance", name: "🛠️ Maintenance & Service Costs", endpoint: "/reports/maintenance", fn: getMaintenanceReport },
      ];
    } else if (role === "Dispatcher") {
      return [
        { id: "delivery-performance", name: "📦 Delivery Performance", endpoint: "/reports/delivery-performance", fn: getDeliveryPerformanceReport },
      ];
    } else if (role === "Driver") {
      return [
        { id: "driver-performance", name: "👤 My Performance Summary", endpoint: "/reports/driver-performance", fn: getDriverPerformanceReport },
      ];
    }
    return [];
  };

  const availableReports = getAvailableReports();
  const [selectedReportId, setSelectedReportId] = useState(availableReports[0]?.id || "delivery-performance");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState("");

  const activeReportConfig = availableReports.find((r) => r.id === selectedReportId) || availableReports[0];

  const fetchReport = async () => {
    if (!activeReportConfig) return;
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const res = await activeReportConfig.fn(params);
      setReportData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to generate report data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeReportConfig) {
      fetchReport();
    }
  }, [selectedReportId, startDate, endDate]);

  const handleExport = async (format) => {
    if (!activeReportConfig) return;
    setExportLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const filename = `${selectedReportId}_${new Date().toISOString().slice(0, 10)}`;
      await downloadReportFile(activeReportConfig.endpoint, format, params, filename);
    } catch (err) {
      setError(`Failed to export ${format.toUpperCase()} file`);
    } finally {
      setExportLoading(false);
    }
  };

  const getLocalISO = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getWeekRange = (baseDate = new Date()) => {
    const day = baseDate.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: getLocalISO(monday),
      end: getLocalISO(sunday),
    };
  };

  const getMonthRange = (baseDate = new Date()) => {
    const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    return {
      start: getLocalISO(firstDay),
      end: getLocalISO(lastDay),
    };
  };

  const setPreset = (type) => {
    const today = new Date();
    if (type === "all") {
      setStartDate("");
      setEndDate("");
    } else if (type === "today") {
      const iso = getLocalISO(today);
      setStartDate(iso);
      setEndDate(iso);
    } else if (type === "weekly" || type === "week") {
      const { start, end } = getWeekRange(today);
      setStartDate(start);
      setEndDate(end);
    } else if (type === "monthly" || type === "month") {
      const { start, end } = getMonthRange(today);
      setStartDate(start);
      setEndDate(end);
    }
  };

  const getActivePreset = () => {
    if (!startDate && !endDate) return "all";
    const today = new Date();
    const todayIso = getLocalISO(today);
    if (startDate === todayIso && endDate === todayIso) return "today";

    const { start: weekStart, end: weekEnd } = getWeekRange(today);
    if (startDate === weekStart && endDate === weekEnd) return "weekly";

    const { start: monthStart, end: monthEnd } = getMonthRange(today);
    if (startDate === monthStart && endDate === monthEnd) return "monthly";

    return null;
  };
  const activePreset = getActivePreset();

  return (
    <div className="flex min-h-screen bg-white text-slate-900 font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-white">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports & Analytics Export</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-blue-600 uppercase mt-1">
              GENERATE FLEET METRICS, PREVIEW DATA & EXPORT PDF/EXCEL
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition flex items-center gap-2"
              title="Refresh Report Data"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              <span>Refresh</span>
            </button>
            <span className="text-xs font-mono text-slate-500">
              OPERATOR: <strong className="text-blue-600">{user?.full_name?.toUpperCase()} ({role?.toUpperCase()})</strong>
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {/* Controls Toolbar: Report Selection & Date Range */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Report Selector Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {availableReports.map((rep) => (
                <button
                  key={rep.id}
                  onClick={() => setSelectedReportId(rep.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition font-mono ${
                    selectedReportId === rep.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {rep.name}
                </button>
              ))}
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport("pdf")}
                disabled={exportLoading || loading || !reportData}
                className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 disabled:opacity-50"
              >
                <span>📄</span>
                <span>Export PDF</span>
              </button>
              <button
                onClick={() => handleExport("excel")}
                disabled={exportLoading || loading || !reportData}
                className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 disabled:opacity-50"
              >
                <span>📊</span>
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* Filters & Presets Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-500 font-mono font-semibold">Date Range:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
              />
              <span className="text-slate-400 font-mono">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={fetchReport}
                disabled={loading}
                className="px-3.5 py-1.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-sm transition"
              >
                Apply
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-mono mr-1">Presets:</span>
              <button
                onClick={() => setPreset("all")}
                className={`px-2.5 py-1 border rounded-lg font-mono text-xs transition ${
                  activePreset === "all"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm font-bold"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
                }`}
              >
                All Time
              </button>
              <button
                onClick={() => setPreset("today")}
                className={`px-2.5 py-1 border rounded-lg font-mono text-xs transition ${
                  activePreset === "today"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm font-bold"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setPreset("weekly")}
                className={`px-2.5 py-1 border rounded-lg font-mono text-xs transition ${
                  activePreset === "weekly"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm font-bold"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setPreset("monthly")}
                className={`px-2.5 py-1 border rounded-lg font-mono text-xs transition ${
                  activePreset === "monthly"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm font-bold"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
        </div>

        {/* Live Preview Section */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-mono text-xs">
            <span className="animate-spin inline-block mr-2">🔄</span> Generating Report Preview...
          </div>
        ) : reportData ? (
          <div className="space-y-6">
            {/* KPI Summary Cards */}
            {reportData.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {Object.entries(reportData.summary)
                  .filter(([_, v]) => typeof v !== "object" || v === null)
                  .map(([k, v]) => (
                    <div key={k} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
                      <p className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-wider truncate">
                        {k.replace(/_/g, " ")}
                      </p>
                      <p className="text-xl font-extrabold text-slate-900 mt-1">
                        {typeof v === "number" ? v.toLocaleString() : (v ?? "—")}
                      </p>
                    </div>
                ))}
              </div>
            )}

            {/* Interactive Data Table Preview */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                  <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wide">
                    Live Data Preview ({reportData.records?.length || 0} Records)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  Generated: {reportData.generated_at}
                </span>
              </div>

              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono sticky top-0">
                    <tr>
                      {reportData.records && reportData.records.length > 0 ? (
                        Object.keys(reportData.records[0]).map((col) => (
                          <th key={col} className="p-3.5 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">
                            {col.replace(/_/g, " ")}
                          </th>
                        ))
                      ) : (
                        <th className="p-4 text-center">No Columns</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {reportData.records && reportData.records.length > 0 ? (
                      reportData.records.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition">
                          {Object.values(row).map((val, cIdx) => (
                            <td key={cIdx} className="p-3.5 text-slate-700 whitespace-nowrap">
                              {val !== null && val !== undefined ? String(val) : "—"}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-slate-400 font-mono">
                          No records found for the selected criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
