import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../Sidebar";
import { getTrips } from "../../api/trips";
import { getShipments } from "../../api/shipments";
import { getAttendanceSummary, listAttendance } from "../../api/attendance";
import { getFuelRecords } from "../../api/fuel";
import { getMaintenanceRecords } from "../../api/maintenance";
import { getProfile } from "../../api/users";
import { getNotifications } from "../../api/notifications";
import {
  DonutChart,
  HorizontalBarChart,
  MetricGauge,
} from "../charts/AnalyticsCharts";

export default function DriverDashboard() {
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [trips, setTrips] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [myAttendance, setMyAttendance] = useState([]);
  const [fuelRecords, setFuelRecords] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [pRes, tRes, sRes, aSumRes, aListRes, fRes, mRes, nRes] = await Promise.all([
        getProfile().catch(() => ({ data: null })),
        getTrips().catch(() => ({ data: [] })),
        getShipments().catch(() => ({ data: [] })),
        getAttendanceSummary({}).catch(() => ({ data: null })),
        listAttendance({}).catch(() => ({ data: [] })),
        getFuelRecords().catch(() => ({ data: [] })),
        getMaintenanceRecords().catch(() => ({ data: [] })),
        getNotifications().catch(() => ({ data: [] })),
      ]);

      setProfile(pRes.data || null);
      setTrips(tRes.data || []);
      setShipments(sRes.data || []);
      setAttendanceSummary(aSumRes.data || null);
      setMyAttendance(aListRes.data || []);
      setFuelRecords(fRes.data || []);
      setMaintenanceRecords(mRes.data || []);
      setNotifications(nRes.data || []);
    } catch (err) {
      setError("Failed to load driver personal workspace");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Driver Identity & Assigned Asset
  const driverName = profile?.full_name || user?.full_name || "Driver";
  const assignedVehicle = profile?.assigned_vehicle;

  // Trips & Progress
  const activeTrip = trips.find((t) => t.status === "Active") || trips.find((t) => t.status === "Scheduled");
  const completedTrips = trips.filter((t) => t.status === "Completed").length;

  // Shipments & Delivery Progress
  const totalShipments = shipments.length;
  const deliveredShipments = shipments.filter((s) => s.status === "Delivered").length;
  const inTransitShipments = shipments.filter((s) => s.status === "In Transit").length;
  const assignedShipments = shipments.filter((s) => s.status === "Assigned").length;
  const deliveryProgressRate = totalShipments > 0 ? ((deliveredShipments / totalShipments) * 100).toFixed(1) : "0.0";

  // Own Fuel Summary
  const totalFuelLitres = fuelRecords.reduce((sum, r) => sum + (Number(r.litres) || 0), 0);
  const totalFuelCost = fuelRecords.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0);

  // Attendance Summary
  const attendanceRate = attendanceSummary?.attendance_rate ?? 100;
  const presentDays = attendanceSummary?.present_days ?? myAttendance.length;

  // Assigned Vehicle Maintenance Status
  const upcomingMaintenance = maintenanceRecords.filter((m) => m.status === "Scheduled");

  // Notifications
  const driverAlerts = notifications.filter((n) => !n.is_read).slice(0, 3);

  // --- Real Database Analytics Graphs ---

  // Graph 1: Shipment Status Breakdown
  const shipmentBreakdownData = [
    { label: "Delivered", value: deliveredShipments, color: "#10b981" },
    { label: "In Transit", value: inTransitShipments, color: "#0F766E" },
    { label: "Assigned", value: assignedShipments, color: "#14B8A6" },
  ].filter((d) => d.value > 0);

  // Graph 2: Attendance & Duty Days
  const attendanceBreakdownData = [
    { label: "Days Present", value: presentDays, formattedValue: `${presentDays} Days`, color: "#10b981" },
    { label: "Days Absent", value: attendanceSummary?.absent_days ?? 0, formattedValue: `${attendanceSummary?.absent_days ?? 0} Days`, color: "#ef4444" },
  ];

  return (
    <div className="flex min-h-screen bg-[#F0FDFA] text-[#1F2937] font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-[#F0FDFA]">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">
              Driver Workspace & Dispatch Summary
            </h1>
            <p className="text-[11px] font-mono font-bold tracking-wider text-[#0F766E] uppercase mt-0.5">
              PERSONAL TRANSIT METRICS, ASSIGNED CARGO PROGRESS & VEHICLE HEALTH
            </p>
          </div>

          <div className="flex items-center gap-3">
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
                DRIVER: <span className="text-[#1F2937]">{driverName}</span>
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl">
            {error}
          </div>
        )}

        {/* 6 Personal Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
            <p className="text-[10px] font-mono text-[#0F766E] font-bold uppercase tracking-wider">ASSIGNED SHIPMENTS</p>
            <p className="text-2xl font-black text-[#1F2937] mt-1">{totalShipments}</p>
            <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{deliveredShipments} DELIVERED</span>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
            <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">DELIVERY RATE</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{deliveryProgressRate}%</p>
            <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">COMPLETED</span>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
            <p className="text-[10px] font-mono text-[#14B8A6] font-bold uppercase tracking-wider">TRIP STATUS</p>
            <p className="text-2xl font-black text-[#14B8A6] mt-1">{activeTrip ? activeTrip.status : "Idle"}</p>
            <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{completedTrips} COMPLETED</span>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
            <p className="text-[10px] font-mono text-[#14B8A6] font-bold uppercase tracking-wider">ATTENDANCE</p>
            <p className="text-2xl font-black text-[#14B8A6] mt-1">{attendanceRate}%</p>
            <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">{presentDays} DAYS PRESENT</span>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
            <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">FUEL LOGGED</p>
            <p className="text-xl font-black text-[#1F2937] mt-1 truncate" title={`${totalFuelLitres.toFixed(1)} L`}>
              {totalFuelLitres.toFixed(0)} L
            </p>
            <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">₹{totalFuelCost.toLocaleString()}</span>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs text-center">
            <p className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">VEHICLE HEALTH</p>
            <p className="text-xl font-black text-[#1F2937] mt-1 truncate">
              {upcomingMaintenance.length > 0 ? `${upcomingMaintenance.length} Svc Due` : "Good"}
            </p>
            <span className="text-[9px] font-mono text-[#6B7280] block mt-0.5">MAINTENANCE</span>
          </div>
        </div>

        {/* Row 1: Active Trip Focus & Assigned Fleet Vehicle */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Trip Summary Card */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs space-y-4 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0F766E]">
                  CURRENT ASSIGNED ROUTE
                </span>
                <h2 className="text-base font-bold text-[#1F2937] mt-0.5">
                  {activeTrip ? `${activeTrip.start_location || "Origin"} ➔ ${activeTrip.destination || "Destination"}` : "No Active Trip Assigned"}
                </h2>
              </div>
              <Link to="/trips" className="text-[10px] font-bold text-[#0F766E] hover:underline">
                View in Live Tracking →
              </Link>
            </div>

            {activeTrip ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[9px] text-[#6B7280] uppercase">STATUS</p>
                  <p className="font-bold text-[#0F766E] mt-0.5">{activeTrip.status}</p>
                </div>
                <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[9px] text-[#6B7280] uppercase">DISTANCE</p>
                  <p className="font-bold text-[#1F2937] mt-0.5">{activeTrip.distance ? `${activeTrip.distance} km` : "—"}</p>
                </div>
                <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[9px] text-[#6B7280] uppercase">DURATION</p>
                  <p className="font-bold text-[#1F2937] mt-0.5">{activeTrip.duration ? `${activeTrip.duration}m` : "—"}</p>
                </div>
                <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[9px] text-[#6B7280] uppercase">PROFILE</p>
                  <p className="font-bold text-[#1F2937] mt-0.5 capitalize">{activeTrip.route_type || "Fastest"}</p>
                </div>
              </div>
            ) : (
              <p className="text-[#6B7280] py-3">
                You are currently not assigned to any pending or in-transit route dispatches.
              </p>
            )}
          </div>

          {/* Assigned Fleet Vehicle Spec Card */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs space-y-4 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  ASSIGNED FLEET ASSET
                </span>
                <h2 className="text-base font-bold text-[#1F2937] mt-0.5">
                  {assignedVehicle ? assignedVehicle.display_name : "Unassigned Vehicle"}
                </h2>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Authorized
              </span>
            </div>

            {assignedVehicle ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[9px] text-[#6B7280] uppercase">REGISTRATION</p>
                  <p className="font-bold text-[#1F2937] mt-0.5">{assignedVehicle.registration_number}</p>
                </div>
                <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[9px] text-[#6B7280] uppercase">MAKE / MODEL</p>
                  <p className="font-bold text-[#1F2937] mt-0.5 truncate">{assignedVehicle.brand} {assignedVehicle.model}</p>
                </div>
                <div className="bg-[#F0FDFA] p-3 rounded-xl border border-[#E5E7EB]">
                  <p className="text-[9px] text-[#6B7280] uppercase">VEHICLE TYPE</p>
                  <p className="font-bold text-[#1F2937] mt-0.5">{assignedVehicle.vehicle_type}</p>
                </div>
              </div>
            ) : (
              <p className="text-[#6B7280] py-3">
                No dedicated vehicle assigned to your profile. Contact your Fleet Manager.
              </p>
            )}
          </div>
        </div>

        {/* Row 2: Visual Analytics & Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Graph 1: Delivery Progress Gauge */}
          <MetricGauge
            value={Number(deliveryProgressRate)}
            title="Assigned Cargo Completion"
            subtitle={`${deliveredShipments} of ${totalShipments} assigned shipments successfully delivered.`}
            color="#10b981"
          />

          {/* Graph 2: Shipment Pipeline Breakdown */}
          <DonutChart
            title="My Shipment Breakdown"
            data={shipmentBreakdownData}
            centerLabel="CARGO"
            centerValue={totalShipments}
          />

          {/* Graph 3: Attendance Duty Days Comparison */}
          <HorizontalBarChart
            title="Duty & Attendance Record"
            data={attendanceBreakdownData}
          />
        </div>

        {/* Row 3: Vehicle Maintenance Notice & Urgent Driver Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vehicle Maintenance Alert Box */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
              <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                <span className="text-[#0F766E]">🛠️</span> Vehicle Service & Health Alert
              </h3>
              <Link to="/maintenance" className="text-[10px] font-bold text-[#0F766E] hover:underline">
                Maintenance Page →
              </Link>
            </div>
            {upcomingMaintenance.length === 0 ? (
              <p className="text-[#6B7280] py-4 text-center">
                ✓ Assigned vehicle has no overdue or upcoming scheduled maintenance.
              </p>
            ) : (
              upcomingMaintenance.map((m) => (
                <div key={m.maintenance_id} className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="font-bold text-amber-900">{m.maintenance_type}</p>
                    <p className="text-[10px] text-amber-700">Scheduled Date: {m.scheduled_date}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                    Scheduled
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Notifications & System Feed */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-[#E5E7EB] pb-2">
              <h3 className="text-xs font-bold text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                <span className="text-[#0F766E]">🔔</span> Dispatch Alerts & Messages ({driverAlerts.length} Unread)
              </h3>
              <span className="text-[10px] text-[#0F766E] font-semibold">Live</span>
            </div>
            <div className="space-y-2">
              {driverAlerts.length === 0 ? (
                <p className="text-[#6B7280] py-4 text-center">No unread notifications.</p>
              ) : (
                driverAlerts.map((n) => (
                  <div key={n.notification_id || n.id} className="p-2.5 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl flex justify-between items-center gap-2">
                    <div>
                      <p className="font-bold text-[#1F2937]">{n.title}</p>
                      <p className="text-[10px] text-[#6B7280] truncate max-w-[320px]">{n.message}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#CCFBF1] text-[#0F766E] flex-shrink-0">
                      Alert
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
