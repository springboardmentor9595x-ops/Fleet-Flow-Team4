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
import { getNotifications } from "../../api/notifications";
import {
  DonutChart,
  HorizontalBarChart,
  VerticalBarChart,
  MetricGauge,
} from "../charts/AnalyticsCharts";

export default function FleetManagerDashboard({ roleSwitcher, viewMode = "operations" }) {
  const { user } = useAuth();

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [fuelRecords, setFuelRecords] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [vRes, dRes, sRes, tRes, fRes, mRes, nRes] = await Promise.all([
        getVehicles().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
        getShipments().catch(() => ({ data: [] })),
        getTrips().catch(() => ({ data: [] })),
        getFuelRecords().catch(() => ({ data: [] })),
        getMaintenanceRecords().catch(() => ({ data: [] })),
        getNotifications().catch(() => ({ data: [] })),
      ]);

      setVehicles(vRes.data || []);
      setDrivers(dRes.data || []);
      setShipments(sRes.data || []);
      setTrips(tRes.data || []);
      setFuelRecords(fRes.data || []);
      setMaintenanceRecords(mRes.data || []);
      setNotifications(nRes.data || []);
    } catch (err) {
      setError("Failed to load fleet manager data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 1. Vehicle KPIs
  const totalVehicles = vehicles.length;
  const availableVehicles = vehicles.filter((v) => v.status === "Available").length;
  const inTransitVehicles = vehicles.filter((v) => v.status === "In Transit" || v.status === "Assigned").length;
  const maintenanceVehicles = vehicles.filter((v) => v.status === "Maintenance").length;
  const activeFleetCount = inTransitVehicles;
  const utilizationRate = totalVehicles > 0 ? ((activeFleetCount / totalVehicles) * 100).toFixed(1) : "0.0";

  // 2. Driver KPIs
  const totalDrivers = drivers.length;
  const availableDrivers = drivers.filter((d) => d.status === "Available").length;
  const assignedDrivers = drivers.filter((d) => d.status === "On Trip" || d.status === "Assigned").length;
  const otherDrivers = Math.max(0, totalDrivers - availableDrivers - assignedDrivers);

  // 3. Trip KPIs
  const totalTrips = trips.length;
  const activeTrips = trips.filter((t) => t.status === "Active").length;
  const scheduledTrips = trips.filter((t) => t.status === "Scheduled").length;
  const completedTrips = trips.filter((t) => t.status === "Completed").length;

  // 4. Shipment KPIs
  const totalShipments = shipments.length;
  const deliveredShipments = shipments.filter((s) => s.status === "Delivered").length;
  const inTransitShipments = shipments.filter((s) => s.status === "In Transit").length;
  const delayedShipments = shipments.filter((s) => s.status === "Delayed").length;
  const pendingShipments = shipments.filter((s) => s.status === "Created" || s.status === "Assigned").length;

  // 5. Fuel & Expense KPIs
  const totalFuelLitres = fuelRecords.reduce((sum, r) => sum + (Number(r.litres) || 0), 0);
  const totalFuelCost = fuelRecords.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);
  const totalMaintenanceCost = maintenanceRecords.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);

  // 6. Maintenance KPIs
  const upcomingMaintenance = maintenanceRecords.filter((m) => m.status === "Scheduled");

  // =========================================================================
  // DEDICATED REAL-DATABASE ANALYTICS DATASETS
  // =========================================================================

  // 1. Vehicle Deployment Status (Donut)
  const vehicleDeploymentData = [
    { label: "Available", value: availableVehicles, color: "#10b981" },
    { label: "Assigned / In Transit", value: inTransitVehicles, color: "#0F766E" },
    { label: "Under Maintenance", value: maintenanceVehicles, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  // 2. Fuel Consumption Trend (Vertical Bar Chart - Real refills over time)
  const fuelTrendData = fuelRecords.map((r, idx) => ({
    label: r.refill_date ? r.refill_date.slice(5) : `Refill #${idx + 1}`,
    value: Number((r.litres || 0).toFixed(1)),
    formattedValue: `${r.litres}L (₹${r.total_cost})`,
    color: "#0F766E",
  }));

  // 3. Maintenance by Service Type (Horizontal Bar Chart)
  const maintTypeMap = {};
  maintenanceRecords.forEach((m) => {
    const t = m.maintenance_type || "General Service";
    maintTypeMap[t] = (maintTypeMap[t] || 0) + (Number(m.cost) || 0);
  });
  const maintenanceByTypeData = Object.entries(maintTypeMap).map(([type, cost]) => ({
    label: type,
    value: cost,
    formattedValue: `₹${cost.toLocaleString()}`,
    color: "#14B8A6",
  }));

  // 4. Trip Performance (Donut Chart)
  const tripPerformanceData = [
    { label: "Completed", value: completedTrips, color: "#10b981" },
    { label: "In Transit", value: activeTrips, color: "#0F766E" },
    { label: "Pending / Scheduled", value: scheduledTrips, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  // 5. Driver Availability (Horizontal Bar Chart)
  const driverAvailabilityData = [
    { label: "Available", value: availableDrivers, formattedValue: `${availableDrivers} Drivers`, color: "#10b981" },
    { label: "Assigned / On Trip", value: assignedDrivers, formattedValue: `${assignedDrivers} Drivers`, color: "#0F766E" },
    { label: "Off Duty / Standby", value: otherDrivers, formattedValue: `${otherDrivers} Drivers`, color: "#9CA3AF" },
  ];

  // 6. Shipment Delivery Status (Donut Chart)
  const shipmentDeliveryData = [
    { label: "Delivered", value: deliveredShipments, color: "#10b981" },
    { label: "In Transit", value: inTransitShipments, color: "#0F766E" },
    { label: "Pending", value: pendingShipments, color: "#9CA3AF" },
    { label: "Delayed", value: delayedShipments, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  // 7. Vehicle/Maintenance Health (Donut Chart)
  const maintStatusMap = {};
  maintenanceRecords.forEach((m) => {
    const s = m.status || "Scheduled";
    maintStatusMap[s] = (maintStatusMap[s] || 0) + 1;
  });
  const maintenanceHealthData = Object.entries(maintStatusMap).map(([st, cnt]) => ({
    label: st,
    value: cnt,
    color: st === "Completed" ? "#10b981" : st === "In Progress" ? "#0F766E" : "#f59e0b",
  }));

  // Alerts
  const activeAlerts = notifications
    .filter((n) => !n.is_read && !n.title?.toLowerCase().includes("your leave request"))
    .slice(0, 3);
  const operatorName = (user?.full_name || user?.email?.split("@")[0] || "FLEET MANAGER").toUpperCase();

  const isAnalyticsView = viewMode === "analytics";

  return (
    <div className="flex min-h-screen bg-[#F0FDFA] text-[#1F2937] font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-[#F0FDFA]">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">
              {isAnalyticsView
                ? "Fleet Analytics & Graphical Intelligence"
                : "Fleet Operations & Summary Dashboard"}
            </h1>
            <p className="text-[11px] font-mono font-bold tracking-wider text-[#0F766E] uppercase mt-0.5">
              {isAnalyticsView
                ? "REAL-TIME DATA VISUALIZATIONS ACROSS ASSET UTILIZATION, FUEL TRENDS & FLEET HEALTH"
                : "REAL-TIME ASSET UTILIZATION, FUEL EXPENDITURE & SERVICE SCHEDULES"}
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
                FLEET MANAGER: <span className="text-[#1F2937]">{operatorName}</span>
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
             DEDICATED FLEET GRAPHICAL ANALYTICS VIEW
             ========================================================================= */
          <div className="space-y-6">
            {/* Analytics Summary Banner */}
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs flex flex-wrap justify-between items-center gap-4">
              <div>
                <p className="text-xs font-mono font-bold text-[#0F766E] uppercase tracking-wider">
                  FLEET ASSET PERFORMANCE & UTILIZATION
                </p>
                <h3 className="text-2xl font-black text-[#1F2937] mt-1">
                  {utilizationRate}% Active Fleet Deployment
                </h3>
                <p className="text-xs text-[#6B7280] font-mono mt-0.5">
                  {activeFleetCount} active in transit, {availableVehicles} standby ready, {maintenanceVehicles} under maintenance
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="bg-[#F0FDFA] border border-[#E5E7EB] px-4 py-2 rounded-xl text-center">
                  <span className="text-[10px] text-[#6B7280] block">TOTAL FUEL SPEND</span>
                  <strong className="text-emerald-700 text-sm">₹{totalFuelCost.toLocaleString()}</strong>
                </div>
                <div className="bg-[#F0FDFA] border border-[#E5E7EB] px-4 py-2 rounded-xl text-center">
                  <span className="text-[10px] text-[#6B7280] block">TOTAL DIESEL LOGGED</span>
                  <strong className="text-[#1F2937] text-sm">{totalFuelLitres.toFixed(1)} L</strong>
                </div>
                <div className="bg-[#F0FDFA] border border-[#E5E7EB] px-4 py-2 rounded-xl text-center">
                  <span className="text-[10px] text-[#6B7280] block">MAINTENANCE OPEX</span>
                  <strong className="text-amber-700 text-sm">₹{totalMaintenanceCost.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            {/* Row 1: Vehicle Status Overview, Fleet Utilization, Fuel Consumption Trend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <DonutChart
                title="1. Vehicle Status Overview"
                data={vehicleDeploymentData}
                centerLabel="VEHICLES"
                centerValue={totalVehicles}
              />
              <MetricGauge
                value={Number(utilizationRate)}
                title="2. Fleet Utilization %"
                subtitle={`${activeFleetCount} of ${totalVehicles} registered assets currently deployed on routes.`}
                color="#0F766E"
              />
              <VerticalBarChart
                title="3. Fuel Consumption Trend (L)"
                data={fuelTrendData}
              />
            </div>

            {/* Row 2: Maintenance by Service Type, Driver Workforce, Vehicle Health */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <HorizontalBarChart
                title="4. Maintenance by Service Type"
                data={maintenanceByTypeData}
              />
              <HorizontalBarChart
                title="5. Driver Workforce Availability"
                data={driverAvailabilityData}
              />
              <DonutChart
                title="6. Vehicle / Maintenance Health"
                data={maintenanceHealthData}
                centerLabel="RECORDS"
                centerValue={maintenanceRecords.length}
              />
            </div>
          </div>
        ) : (
          /* =========================================================================
             FLEET OPERATIONS & SUMMARY VIEW
             ========================================================================= */
          <div className="space-y-6">
            {/* 8 Fleet Manager Summary KPI Cards */}
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
                <p className="text-[10px] font-mono text-[#0F766E] font-bold uppercase tracking-wider">IN TRANSIT</p>
                <p className="text-2xl font-black text-[#0F766E] mt-1">{inTransitVehicles}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">ACTIVE ROUTES</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">MAINTENANCE</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{maintenanceVehicles}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">IN SERVICE</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#14B8A6] font-bold uppercase tracking-wider">UTILIZATION</p>
                <p className="text-2xl font-black text-[#14B8A6] mt-1">{utilizationRate}%</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">ACTIVE ASSETS</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#0F766E] font-bold uppercase tracking-wider">ACTIVE TRIPS</p>
                <p className="text-2xl font-black text-[#0F766E] mt-1">{activeTrips}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{totalTrips} TOTAL</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">FUEL USED</p>
                <p className="text-xl font-black text-[#1F2937] mt-1 truncate" title={`${totalFuelLitres.toFixed(1)} L`}>
                  {totalFuelLitres.toFixed(0)} L
                </p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">₹{(totalFuelCost / 1000).toFixed(1)}k COST</span>
              </div>
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-rose-600 font-bold uppercase tracking-wider">UPCOMING SVC</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{upcomingMaintenance.length}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">SCHEDULED</span>
              </div>
            </div>

            {/* Operational Visual Status & Deployment Gauge */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DonutChart
                title="Vehicle Deployment Status"
                data={vehicleDeploymentData}
                centerLabel="VEHICLES"
                centerValue={totalVehicles}
              />
              <MetricGauge
                value={Number(utilizationRate)}
                title="Fleet Utilization Rate"
                subtitle={`${activeFleetCount} of ${totalVehicles} registered assets currently deployed on routes.`}
                color="#0F766E"
              />
            </div>

            {/* Operational Lists & Live Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Maintenance Watchlist */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
                  <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-[#0F766E]">🛠️</span> Upcoming Maintenance ({upcomingMaintenance.length})
                  </h3>
                  <Link to="/maintenance" className="text-[10px] text-[#0F766E] font-bold hover:underline">
                    View All →
                  </Link>
                </div>
                <div className="space-y-2">
                  {upcomingMaintenance.length === 0 ? (
                    <p className="text-[#6B7280] py-4 text-center">No pending maintenance scheduled.</p>
                  ) : (
                    upcomingMaintenance.slice(0, 3).map((m) => (
                      <div key={m.maintenance_id} className="p-3 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl flex justify-between items-center">
                        <div>
                          <strong className="text-[#1F2937] block">{m.registration_number || "Vehicle"} — {m.maintenance_type}</strong>
                          <span className="text-[11px] text-[#6B7280]">Scheduled: {m.scheduled_date || "Soon"}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold text-[10px]">
                          ₹{m.cost || 0}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Priority Operational Alerts */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
                  <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-[#0F766E]">🔔</span> Priority Operational Alerts ({activeAlerts.length})
                  </h3>
                  <span className="text-[10px] text-[#0F766E] font-semibold">Live System Feed</span>
                </div>
                <div className="space-y-2">
                  {activeAlerts.length === 0 ? (
                    <p className="text-[#6B7280] py-4 text-center">✓ All operational systems nominal.</p>
                  ) : (
                    activeAlerts.map((n) => (
                      <div key={n.notification_id || n.id} className="p-3 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl flex justify-between items-center gap-3">
                        <div>
                          <p className="font-bold text-[#1F2937]">{n.title}</p>
                          <p className="text-[11px] text-[#6B7280] truncate max-w-[320px]">{n.message}</p>
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
