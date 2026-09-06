import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../Sidebar";
import { getVehicles } from "../../api/vehicles";
import { getDrivers } from "../../api/drivers";
import { getShipments } from "../../api/shipments";
import { getTrips } from "../../api/trips";
import { getFuelRecords } from "../../api/fuel";
import { getMaintenanceRecords } from "../../api/maintenance";
import { getAttendanceSummary } from "../../api/attendance";
import { getNotifications } from "../../api/notifications";
import { getAdminUsers } from "../../api/users";
import {
  DonutChart,
  HorizontalBarChart,
  VerticalBarChart,
  MetricGauge,
} from "../charts/AnalyticsCharts";

export default function AdminDashboard({ roleSwitcher, viewMode = "overview" }) {
  const { user } = useAuth();

  const [usersList, setUsersList] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [fuelRecords, setFuelRecords] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [uRes, vRes, dRes, sRes, tRes, fRes, mRes, aRes, nRes] = await Promise.all([
        getAdminUsers().catch(() => ({ data: [] })),
        getVehicles().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
        getShipments().catch(() => ({ data: [] })),
        getTrips().catch(() => ({ data: [] })),
        getFuelRecords().catch(() => ({ data: [] })),
        getMaintenanceRecords().catch(() => ({ data: [] })),
        getAttendanceSummary({}).catch(() => ({ data: null })),
        getNotifications().catch(() => ({ data: [] })),
      ]);

      setUsersList(uRes.data || []);
      setVehicles(vRes.data || []);
      setDrivers(dRes.data || []);
      setShipments(sRes.data || []);
      setTrips(tRes.data || []);
      setFuelRecords(fRes.data || []);
      setMaintenanceRecords(mRes.data || []);
      setAttendanceSummary(aRes.data || null);
      setNotifications(nRes.data || []);
    } catch (err) {
      setError("Failed to load executive admin analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 1. Vehicle Metrics
  const totalVehicles = vehicles.length;
  const availableVehicles = vehicles.filter((v) => v.status === "Available").length;
  const inTransitVehicles = vehicles.filter((v) => v.status === "In Transit").length;
  const assignedVehicles = vehicles.filter((v) => v.status === "Assigned").length;
  const maintenanceVehicles = vehicles.filter((v) => v.status === "Maintenance").length;
  const activeFleetCount = inTransitVehicles + assignedVehicles;
  const utilizationRate = totalVehicles > 0 ? ((activeFleetCount / totalVehicles) * 100).toFixed(1) : "0.0";

  // 2. Driver Metrics
  const totalDrivers = drivers.length;
  const availableDrivers = drivers.filter((d) => d.status === "Available").length;

  // 3. Trip Metrics
  const totalTrips = trips.length;
  const activeTrips = trips.filter((t) => t.status === "Active").length;
  const scheduledTrips = trips.filter((t) => t.status === "Scheduled").length;
  const completedTrips = trips.filter((t) => t.status === "Completed").length;

  // 4. Shipment Metrics
  const totalShipments = shipments.length;
  const deliveredShipments = shipments.filter((s) => s.status === "Delivered").length;
  const inTransitShipments = shipments.filter((s) => s.status === "In Transit").length;
  const assignedShipments = shipments.filter((s) => s.status === "Assigned").length;
  const createdShipments = shipments.filter((s) => s.status === "Created").length;
  const delayedShipments = shipments.filter((s) => s.status === "Delayed").length;
  const pendingShipments = createdShipments + assignedShipments;
  const onTimeRate = totalShipments > 0 ? (((totalShipments - delayedShipments) / totalShipments) * 100).toFixed(1) : "100.0";

  // 5. Fuel & Expense Metrics
  const totalFuelLitres = fuelRecords.reduce((sum, r) => sum + (Number(r.litres) || 0), 0);
  const totalFuelCost = fuelRecords.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
  const totalMaintenanceCost = maintenanceRecords.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);

  // 6. Attendance Metric
  const attendanceRate = attendanceSummary?.attendance_rate ?? 100;
  const presentDays = attendanceSummary?.present_days ?? 0;

  // =========================================================================
  // ANALYTICS DATASETS (REAL DATABASE DATA ONLY)
  // =========================================================================

  // Graph 1: User Registration Distribution & Trend
  const userRoleMap = {};
  usersList.forEach((u) => {
    const r = u.role || "Driver";
    userRoleMap[r] = (userRoleMap[r] || 0) + 1;
  });
  const userRegistrationData = Object.entries(userRoleMap).map(([role, count]) => ({
    label: role,
    value: count,
    formattedValue: `${count} Users`,
    color: role === "Admin" ? "#0F766E" : role === "FleetManager" ? "#14B8A6" : role === "Dispatcher" ? "#0D9488" : "#2DD4BF",
  }));

  // Graph 2: Vehicle Registration Trend (Additions by Type / Date)
  const vehTypeMap = {};
  vehicles.forEach((v) => {
    const t = v.vehicle_type || "Truck";
    vehTypeMap[t] = (vehTypeMap[t] || 0) + 1;
  });
  const vehicleRegistrationData = Object.entries(vehTypeMap).map(([type, count]) => ({
    label: type,
    value: count,
    formattedValue: `${count} Units`,
    color: "#0F766E",
  }));

  // Graph 2b: Vehicle Status Distribution (Theme colored)
  const vehicleStatusData = [
    { label: "Available", value: availableVehicles, color: "#10b981" },
    { label: "In Transit", value: inTransitVehicles, color: "#0F766E" },
    { label: "Assigned", value: assignedVehicles, color: "#14B8A6" },
    { label: "Maintenance", value: maintenanceVehicles, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  // Graph 3: Shipment Delivery / Status Distribution
  const deliveryStatusData = [
    { label: "Delivered", value: deliveredShipments, color: "#10b981" },
    { label: "In Transit", value: inTransitShipments, color: "#0F766E" },
    { label: "Assigned", value: assignedShipments, color: "#14B8A6" },
    { label: "Pending", value: createdShipments, color: "#9CA3AF" },
    { label: "Delayed", value: delayedShipments, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  // Graph 4: Maintenance Cost by Type
  const maintTypeMap = {};
  maintenanceRecords.forEach((m) => {
    const t = m.maintenance_type || "General";
    maintTypeMap[t] = (maintTypeMap[t] || 0) + (Number(m.cost) || 0);
  });
  const maintenanceCostData = Object.entries(maintTypeMap).map(([type, cost]) => ({
    label: type,
    value: cost,
    formattedValue: `₹${cost.toLocaleString()}`,
    color: "#f59e0b",
  }));

  // Graph 5: Fuel Consumption by Type / Volume
  const fuelTypeMap = {};
  fuelRecords.forEach((r) => {
    const t = r.fuel_type || "Diesel";
    fuelTypeMap[t] = (fuelTypeMap[t] || 0) + (Number(r.litres) || 0);
  });
  const fuelConsumptionData = Object.entries(fuelTypeMap).map(([type, litres]) => ({
    label: type,
    value: Number(litres.toFixed(1)),
    formattedValue: `${litres.toFixed(1)} L`,
    color: "#0F766E",
  }));

  // Graph 6: Driver Performance Overview
  const driverPerformanceData = drivers.slice(0, 5).map((d, idx) => ({
    label: d.full_name || `Driver #${idx + 1}`,
    value: d.status === "On Trip" ? 2 : d.status === "Available" ? 1 : 0,
    formattedValue: d.status,
    color: d.status === "On Trip" ? "#0F766E" : "#10b981",
  }));

  // Graph 7: Trip Status Distribution
  const tripStatusData = [
    { label: "Completed", value: completedTrips, color: "#10b981" },
    { label: "Active Dispatch", value: activeTrips, color: "#0F766E" },
    { label: "Scheduled", value: scheduledTrips, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  // Operational Alerts (Unread)
  const urgentAlerts = notifications
    .filter((n) => !n.is_read && !n.title?.toLowerCase().includes("your leave request"))
    .slice(0, 3);
  const operatorName = (user?.full_name || user?.email?.split("@")[0] || "ADMIN").toUpperCase();

  const isAnalyticsView = viewMode === "analytics";

  return (
    <div className="flex min-h-screen bg-[#F0FDFA] text-[#1F2937] font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-[#F0FDFA]">
        {/* Top Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">
              {isAnalyticsView
                ? "Admin & System Analytics Dashboard"
                : "Executive Operations & Admin Dashboard"}
            </h1>
            <p className="text-[11px] font-mono font-bold tracking-wider text-[#0F766E] uppercase mt-0.5">
              {isAnalyticsView
                ? "SYSTEM-WIDE DATA INTELLIGENCE: USER GROWTH, ASSET FLEET, LOGISTICS PIPELINE & OPEX TRENDS"
                : "ENTERPRISE-WIDE FLEET OPERATIONS, ATTENDANCE HEALTH & SECURITY CONTROL"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {roleSwitcher}
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2 bg-white rounded-xl hover:bg-[#CCFBF1]/50 border border-[#E5E7EB] text-[#1F2937] text-xs font-semibold shadow-xs transition flex items-center gap-2"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              <span>Refresh</span>
            </button>
            <div className="text-right">
              <p className="text-[11px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">
                ADMIN: <span className="text-[#1F2937]">{operatorName}</span>
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl">
            {error}
          </div>
        )}

        {isAnalyticsView ? (
          /* =========================================================================
             DEDICATED ADMIN SYSTEM ANALYTICS VIEW
             ========================================================================= */
          <div className="space-y-6">
            {/* System Analytics Top KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">REGISTERED USERS</p>
                <p className="text-2xl font-black text-[#0F766E] mt-1">{usersList.length}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">ACCOUNTS</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">REGISTERED VEHICLES</p>
                <p className="text-2xl font-black text-[#14B8A6] mt-1">{totalVehicles}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{availableVehicles} STANDBY</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">ACTIVE SHIPMENTS</p>
                <p className="text-2xl font-black text-[#1F2937] mt-1">{inTransitShipments + assignedShipments}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{totalShipments} TOTAL</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#0F766E] font-bold uppercase tracking-wider">FLEET UTILIZATION</p>
                <p className="text-2xl font-black text-[#0F766E] mt-1">{utilizationRate}%</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">ACTIVE ASSETS</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">ON-TIME DELIVERY</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{onTimeRate}%</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">RELIABILITY</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-rose-600 font-bold uppercase tracking-wider">TOTAL OPEX</p>
                <p className="text-xl font-black text-[#1F2937] mt-1">₹{((totalFuelCost + totalMaintenanceCost) / 1000).toFixed(1)}k</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">FUEL + SERVICE</span>
              </div>
            </div>

            {/* Row 1 Analytics: User Registrations, Vehicle Registrations, Fleet Utilization */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <HorizontalBarChart
                title="1. User Registration Breakdown"
                data={userRegistrationData}
              />
              <VerticalBarChart
                title="2. Vehicle Registration by Type"
                data={vehicleRegistrationData}
              />
              <MetricGauge
                value={Number(utilizationRate)}
                title="3. Overall Fleet Utilization"
                subtitle={`${activeFleetCount} of ${totalVehicles} vehicles deployed on active delivery routes.`}
                color="#0F766E"
              />
            </div>

            {/* Row 2 Analytics: Shipment Distribution, Fuel Trends, Maintenance Spend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <DonutChart
                title="4. Shipment Delivery Status"
                data={deliveryStatusData}
                centerLabel="SHIPMENTS"
                centerValue={totalShipments}
              />
              <VerticalBarChart
                title="5. Fuel Consumption (Litres)"
                data={fuelConsumptionData}
              />
              <HorizontalBarChart
                title="6. Maintenance Spend by Type"
                data={maintenanceCostData}
              />
            </div>

            {/* Row 3 Analytics: Driver Performance & Trip Performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <HorizontalBarChart
                title="7. Driver Workforce Performance"
                data={driverPerformanceData}
              />
              <DonutChart
                title="8. Trip Performance Distribution"
                data={tripStatusData}
                centerLabel="TRIPS"
                centerValue={totalTrips}
              />
            </div>
          </div>
        ) : (
          /* =========================================================================
             EXECUTIVE ADMIN OPERATIONS OVERVIEW VIEW
             ========================================================================= */
          <div className="space-y-6">
            {/* 8 Primary Executive KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">TOTAL FLEET</p>
                <p className="text-2xl font-black text-[#1F2937] mt-1">{totalVehicles}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">VEHICLES</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">AVAILABLE</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{availableVehicles}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">STANDBY</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">MAINTENANCE</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{maintenanceVehicles}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">IN SERVICE</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#14B8A6] font-bold uppercase tracking-wider">DRIVERS</p>
                <p className="text-2xl font-black text-[#14B8A6] mt-1">{totalDrivers}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{availableDrivers} READY</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#0F766E] font-bold uppercase tracking-wider">ACTIVE TRIPS</p>
                <p className="text-2xl font-black text-[#0F766E] mt-1">{activeTrips}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{totalTrips} TOTAL</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#14B8A6] font-bold uppercase tracking-wider">SHIPMENTS</p>
                <p className="text-2xl font-black text-[#14B8A6] mt-1">{totalShipments}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{pendingShipments} PENDING</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">DELIVERED</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{deliveredShipments}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{onTimeRate}% ON TIME</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-rose-600 font-bold uppercase tracking-wider">TOTAL OPEX</p>
                <p className="text-xl font-black text-[#1F2937] mt-1 truncate" title={`₹${(totalFuelCost + totalMaintenanceCost).toLocaleString()}`}>
                  ₹{((totalFuelCost + totalMaintenanceCost) / 1000).toFixed(1)}k
                </p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">FUEL+MAINT</span>
              </div>
            </div>

            {/* Strategic Overview & Quick Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <DonutChart
                title="Vehicle Status Distribution"
                data={vehicleStatusData}
                centerLabel="ASSETS"
                centerValue={totalVehicles}
              />
              <MetricGauge
                value={Number(utilizationRate)}
                title="Fleet Utilization Rate"
                subtitle={`${activeFleetCount} of ${totalVehicles} total vehicles deployed on active routes.`}
                color="#0F766E"
              />
              <DonutChart
                title="Delivery Performance Distribution"
                data={deliveryStatusData}
                centerLabel="SHIPMENTS"
                centerValue={totalShipments}
              />
            </div>

            {/* Executive Operational Summaries & Live Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
                <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                  <span className="text-[#0F766E]">📋</span> Executive Operational Summary
                </h3>
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center py-1 border-b border-[#E5E7EB]">
                    <span className="text-[#6B7280]">Fleet Deployment Ratio</span>
                    <strong className="text-[#0F766E]">{utilizationRate}% Active</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[#E5E7EB]">
                    <span className="text-[#6B7280]">On-Time Delivery Index</span>
                    <strong className="text-emerald-600">{onTimeRate}% Success</strong>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[#E5E7EB]">
                    <span className="text-[#6B7280]">Workforce Attendance Rate</span>
                    <strong className="text-[#1F2937]">{attendanceRate}% ({presentDays} Days Present)</strong>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[#6B7280]">Total Fuel Expenditure</span>
                    <strong className="text-emerald-700">₹{totalFuelCost.toLocaleString()} ({totalFuelLitres.toFixed(1)} L)</strong>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
                  <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-[#0F766E]">🔔</span> Priority Operational Alerts ({urgentAlerts.length} Unread)
                  </h3>
                  <span className="text-[10px] text-[#0F766E] font-semibold">Live System Feed</span>
                </div>
                <div className="space-y-2">
                  {urgentAlerts.length === 0 ? (
                    <p className="text-[#6B7280] py-6 text-center text-xs">
                      ✓ All operational systems nominal. No unread critical alerts.
                    </p>
                  ) : (
                    urgentAlerts.map((n) => (
                      <div key={n.notification_id || n.id} className="p-3 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl flex justify-between items-center gap-3">
                        <div>
                          <p className="font-bold text-[#1F2937]">{n.title}</p>
                          <p className="text-[11px] text-[#6B7280] truncate max-w-[400px]">{n.message}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#CCFBF1] text-[#0F766E] flex-shrink-0">
                          Alert
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
