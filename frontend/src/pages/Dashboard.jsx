import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import AdminDashboard from "../components/dashboards/AdminDashboard";
import FleetManagerDashboard from "../components/dashboards/FleetManagerDashboard";
import DispatcherDashboard from "../components/dashboards/DispatcherDashboard";
import DriverDashboard from "../components/dashboards/DriverDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  const rawRole = user?.role;
  const normalizedRole = typeof rawRole === "string"
    ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");

  // Tab state for multi-dashboard roles
  const [adminTab, setAdminTab] = useState("ADMIN"); // ADMIN | FLEET | LOGISTICS | ANALYTICS
  const [fmTab, setFmTab] = useState("FLEET"); // FLEET | LOGISTICS | ANALYTICS
  const [dispTab, setDispTab] = useState("LOGISTICS"); // LOGISTICS | ANALYTICS

  // 1. ADMIN: Admin Dashboard | Fleet | Logistics | Analytics
  if (normalizedRole === "admin") {
    const tabs = (
      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          onClick={() => setAdminTab("ADMIN")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            adminTab === "ADMIN" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>👑</span>
          <span>Admin Dashboard</span>
        </button>
        <button
          onClick={() => setAdminTab("FLEET")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            adminTab === "FLEET" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>🚚</span>
          <span>Fleet</span>
        </button>
        <button
          onClick={() => setAdminTab("LOGISTICS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            adminTab === "LOGISTICS" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>📦</span>
          <span>Logistics</span>
        </button>
        <button
          onClick={() => setAdminTab("ANALYTICS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            adminTab === "ANALYTICS" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>📊</span>
          <span>Analytics</span>
        </button>
      </div>
    );

    if (adminTab === "FLEET") return <FleetManagerDashboard roleSwitcher={tabs} viewMode="operations" />;
    if (adminTab === "LOGISTICS") return <DispatcherDashboard roleSwitcher={tabs} viewMode="operations" />;
    if (adminTab === "ANALYTICS") return <AdminDashboard roleSwitcher={tabs} viewMode="analytics" />;
    return <AdminDashboard roleSwitcher={tabs} viewMode="overview" />;
  }

  // 2. FLEET MANAGER: Fleet | Logistics | Analytics
  if (normalizedRole === "fleetmanager") {
    const tabs = (
      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          onClick={() => setFmTab("FLEET")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            fmTab === "FLEET" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>🚚</span>
          <span>Fleet</span>
        </button>
        <button
          onClick={() => setFmTab("LOGISTICS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            fmTab === "LOGISTICS" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>📦</span>
          <span>Logistics</span>
        </button>
        <button
          onClick={() => setFmTab("ANALYTICS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            fmTab === "ANALYTICS" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>📊</span>
          <span>Analytics</span>
        </button>
      </div>
    );

    if (fmTab === "LOGISTICS") return <DispatcherDashboard roleSwitcher={tabs} viewMode="operations" />;
    if (fmTab === "ANALYTICS") return <FleetManagerDashboard roleSwitcher={tabs} viewMode="analytics" />;
    return <FleetManagerDashboard roleSwitcher={tabs} viewMode="operations" />;
  }

  // 3. DISPATCHER: Logistics | Analytics
  if (normalizedRole === "dispatcher") {
    const tabs = (
      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          onClick={() => setDispTab("LOGISTICS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            dispTab === "LOGISTICS" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>📦</span>
          <span>Logistics</span>
        </button>
        <button
          onClick={() => setDispTab("ANALYTICS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            dispTab === "ANALYTICS" ? "bg-[#0F766E] text-white shadow-xs" : "text-[#6B7280] hover:text-[#1F2937]"
          }`}
        >
          <span>📊</span>
          <span>Analytics</span>
        </button>
      </div>
    );

    if (dispTab === "ANALYTICS") return <DispatcherDashboard roleSwitcher={tabs} viewMode="analytics" />;
    return <DispatcherDashboard roleSwitcher={tabs} viewMode="operations" />;
  }

  // 4. DRIVER: Driver Personal Dashboard
  return <DriverDashboard />;
}