import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../Sidebar";
import { getShipments } from "../../api/shipments";
import { getTrips } from "../../api/trips";
import { getDrivers } from "../../api/drivers";
import { getNotifications } from "../../api/notifications";
import {
  DonutChart,
  HorizontalBarChart,
  VerticalBarChart,
  MetricGauge,
} from "../charts/AnalyticsCharts";

export default function DispatcherDashboard({ roleSwitcher, viewMode = "operations" }) {
  const { user } = useAuth();

  const [shipments, setShipments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [sRes, tRes, dRes, nRes] = await Promise.all([
        getShipments().catch(() => ({ data: [] })),
        getTrips().catch(() => ({ data: [] })),
        getDrivers().catch(() => ({ data: [] })),
        getNotifications().catch(() => ({ data: [] })),
      ]);

      setShipments(sRes.data || []);
      setTrips(tRes.data || []);
      setDrivers(dRes.data || []);
      setNotifications(nRes.data || []);
    } catch (err) {
      setError("Failed to load dispatcher logistics analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 1. Shipment KPIs
  const totalShipments = shipments.length;
  const inTransitShipments = shipments.filter((s) => s.status === "In Transit").length;
  const assignedShipments = shipments.filter((s) => s.status === "Assigned").length;
  const createdShipments = shipments.filter((s) => s.status === "Created").length;
  const pendingShipments = createdShipments + assignedShipments;
  const deliveredShipments = shipments.filter((s) => s.status === "Delivered").length;
  const delayedShipments = shipments.filter((s) => s.status === "Delayed").length;

  const onTimeRate = totalShipments > 0 ? (((totalShipments - delayedShipments) / totalShipments) * 100).toFixed(1) : "100.0";

  // 2. Trip KPIs
  const totalTrips = trips.length;
  const activeTrips = trips.filter((t) => t.status === "Active").length;
  const scheduledTrips = trips.filter((t) => t.status === "Scheduled").length;
  const completedTrips = trips.filter((t) => t.status === "Completed").length;

  // 3. Driver Availability
  const totalDrivers = drivers.length;
  const availableDrivers = drivers.filter((d) => d.status === "Available").length;

  // 4. Active Routes
  const activeRoutes = [...new Set(trips.filter((t) => t.status === "Active" || t.status === "Scheduled").map((t) => `${t.start_location} ➔ ${t.destination}`))];

  // --- Real Database Analytics Graphs ---

  // Graph 1: Shipment Status Distribution
  const shipmentStatusData = [
    { label: "Delivered", value: deliveredShipments, color: "#10b981" },
    { label: "In Transit", value: inTransitShipments, color: "#0F766E" },
    { label: "Assigned", value: assignedShipments, color: "#14B8A6" },
    { label: "Created", value: createdShipments, color: "#9CA3AF" },
    { label: "Delayed", value: delayedShipments, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  // Graph 2: Delivery Performance Comparison
  const deliveryPerformanceData = [
    { label: "On-Time Deliveries", value: totalShipments - delayedShipments, formattedValue: `${totalShipments - delayedShipments} Cargo`, color: "#10b981" },
    { label: "Delayed Deliveries", value: delayedShipments, formattedValue: `${delayedShipments} Delayed`, color: "#ef4444" },
    { label: "In-Transit Active", value: inTransitShipments, formattedValue: `${inTransitShipments} Active`, color: "#0F766E" },
  ];

  // Graph 3: Trip Performance Distribution
  const tripPerformanceData = [
    { label: "Active Dispatch", value: activeTrips, color: "#0F766E" },
    { label: "Scheduled", value: scheduledTrips, color: "#f59e0b" },
    { label: "Completed", value: completedTrips, color: "#10b981" },
  ].filter((d) => d.value > 0);

  // Graph 4: Active Route Cargo Weight Distribution
  const routeWeightData = shipments.slice(0, 5).map((s) => ({
    label: `${s.source} ➔ ${s.destination}`,
    value: Number(s.shipment_weight) || 500,
    formattedValue: `${s.shipment_weight} kg`,
    color: "#0F766E",
  }));

  // Filter urgent dispatch notifications (logistics-relevant only)
  const dispatchAlerts = notifications
    .filter((n) => !n.is_read && n.type !== "maintenance" && !n.title?.toLowerCase().includes("leave"))
    .slice(0, 3);
  const operatorName = (user?.full_name || user?.email?.split("@")[0] || "DISPATCHER").toUpperCase();

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
                ? "Logistics Analytics & Dispatch Intelligence"
                : "Logistics Operations & Dispatch Dashboard"}
            </h1>
            <p className="text-[11px] font-mono font-bold tracking-wider text-[#0F766E] uppercase mt-0.5">
              {isAnalyticsView
                ? "REAL-TIME SHIPMENT DELIVERY PERFORMANCE, ON-TIME RELIABILITY & ROUTE CARGO METRICS"
                : "CARGO PIPELINE, ACTIVE DISPATCH QUEUE & FLEET TELEMETRY"}
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
                CONTROLLER: <span className="text-[#1F2937]">{operatorName}</span>
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
             DEDICATED LOGISTICS & DISPATCH GRAPHICAL ANALYTICS VIEW
             ========================================================================= */
          <div className="space-y-6">
            {/* Analytics Performance Summary Banner */}
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs flex flex-wrap justify-between items-center gap-4">
              <div>
                <p className="text-xs font-mono font-bold text-[#0F766E] uppercase tracking-wider">
                  LOGISTICS DELIVERY PERFORMANCE INDEX
                </p>
                <h3 className="text-2xl font-black text-[#1F2937] mt-1">
                  {onTimeRate}% On-Time Reliability
                </h3>
                <p className="text-xs text-[#6B7280] font-mono mt-0.5">
                  {deliveredShipments} completed cargo deliveries, {inTransitShipments} active in transit, {delayedShipments} delayed
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="bg-[#F0FDFA] border border-[#E5E7EB] px-4 py-2 rounded-xl text-center">
                  <span className="text-[10px] text-[#6B7280] block">ACTIVE DISPATCHES</span>
                  <strong className="text-[#0F766E] text-sm">{activeTrips} Trips</strong>
                </div>
                <div className="bg-[#F0FDFA] border border-[#E5E7EB] px-4 py-2 rounded-xl text-center">
                  <span className="text-[10px] text-[#6B7280] block">PENDING ORDERS</span>
                  <strong className="text-[#1F2937] text-sm">{pendingShipments} Orders</strong>
                </div>
                <div className="bg-[#F0FDFA] border border-[#E5E7EB] px-4 py-2 rounded-xl text-center">
                  <span className="text-[10px] text-[#6B7280] block">AVAILABLE DRIVERS</span>
                  <strong className="text-emerald-700 text-sm">{availableDrivers} Ready</strong>
                </div>
              </div>
            </div>

            {/* Row 1: Shipment Delivery Status, Delivery Performance, On-Time Reliability */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <DonutChart
                title="1. Shipment Delivery Status"
                data={shipmentStatusData}
                centerLabel="SHIPMENTS"
                centerValue={totalShipments}
              />
              <HorizontalBarChart
                title="2. Delivery Performance Comparison"
                data={deliveryPerformanceData}
              />
              <MetricGauge
                value={Number(onTimeRate)}
                title="3. On-Time Delivery Rate"
                subtitle={`${totalShipments - delayedShipments} of ${totalShipments} total shipments fulfilled without schedule delays.`}
                color="#0F766E"
              />
            </div>

            {/* Row 2: Trip Route Performance & Route Cargo Weight */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DonutChart
                title="4. Trip Dispatch & Route Performance"
                data={tripPerformanceData}
                centerLabel="TRIPS"
                centerValue={totalTrips}
              />
              <VerticalBarChart
                title="5. Route Cargo Weight Distribution (kg)"
                data={routeWeightData}
              />
            </div>
          </div>
        ) : (
          /* =========================================================================
             LOGISTICS OPERATIONS & DISPATCH OVERVIEW
             ========================================================================= */
          <div className="space-y-6">
            {/* 8 Primary Dispatcher KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#0F766E] font-bold uppercase tracking-wider">ACTIVE TRIPS</p>
                <p className="text-2xl font-black text-[#0F766E] mt-1">{activeTrips}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{totalTrips} TOTAL</span>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">PENDING</p>
                <p className="text-2xl font-black text-[#1F2937] mt-1">{pendingShipments}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">TO DISPATCH</span>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#14B8A6] font-bold uppercase tracking-wider">IN TRANSIT</p>
                <p className="text-2xl font-black text-[#14B8A6] mt-1">{inTransitShipments}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">ON HIGHWAY</span>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">DELIVERED</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{deliveredShipments}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">COMPLETED</span>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-rose-600 font-bold uppercase tracking-wider">DELAYED</p>
                <p className="text-2xl font-black text-rose-600 mt-1">{delayedShipments}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">REQUIRES SYNC</span>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">ON-TIME %</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{onTimeRate}%</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">RELIABILITY</span>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#14B8A6] font-bold uppercase tracking-wider">DRIVERS</p>
                <p className="text-2xl font-black text-[#14B8A6] mt-1">{availableDrivers}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">AVAILABLE</span>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
                <p className="text-[10px] font-mono text-[#6B7280] font-bold uppercase tracking-wider">ROUTES</p>
                <p className="text-2xl font-black text-[#1F2937] mt-1">{activeRoutes.length || 1}</p>
                <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">CORRIDORS</span>
              </div>
            </div>

            {/* Operational Visual Pipeline & Snapshot */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DonutChart
                title="Shipment Pipeline Status"
                data={shipmentStatusData}
                centerLabel="ORDERS"
                centerValue={totalShipments}
              />
              <DonutChart
                title="Active Trip Performance"
                data={tripPerformanceData}
                centerLabel="TRIPS"
                centerValue={totalTrips}
              />
            </div>

            {/* Operational Lists & Live Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Active Route Corridors */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
                  <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-[#0F766E]">🗺️</span> Active Highway Corridors ({activeRoutes.length})
                  </h3>
                  <Link to="/trips" className="text-[10px] text-[#0F766E] font-bold hover:underline">
                    Live Map →
                  </Link>
                </div>
                <div className="space-y-2">
                  {activeRoutes.length === 0 ? (
                    <p className="text-[#6B7280] py-4 text-center">No active transit corridors right now.</p>
                  ) : (
                    activeRoutes.slice(0, 4).map((r, i) => (
                      <div key={i} className="p-2.5 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl flex justify-between items-center">
                        <span className="font-bold text-[#1F2937]">{r}</span>
                        <span className="text-[10px] text-[#0F766E] font-bold">Active</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Priority Dispatch Alerts */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
                  <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                    <span className="text-[#0F766E]">🔔</span> Urgent Logistics Notices ({dispatchAlerts.length})
                  </h3>
                  <span className="text-[10px] text-[#0F766E] font-semibold">Real-Time Sync</span>
                </div>
                <div className="space-y-2">
                  {dispatchAlerts.length === 0 ? (
                    <p className="text-[#6B7280] py-4 text-center">✓ All dispatches proceeding on schedule.</p>
                  ) : (
                    dispatchAlerts.map((n) => (
                      <div key={n.notification_id || n.id} className="p-3 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl flex justify-between items-center gap-3">
                        <div>
                          <p className="font-bold text-[#1F2937]">{n.title}</p>
                          <p className="text-[11px] text-[#6B7280] truncate max-w-[320px]">{n.message}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#CCFBF1] text-[#0F766E] flex-shrink-0">
                          Transit
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
