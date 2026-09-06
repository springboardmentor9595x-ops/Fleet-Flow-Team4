import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getNotifications, markNotificationAsRead } from "../api/notifications";


export default function Sidebar() {
  const { user, logout, deleteAccount } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [filterType, setFilterType] = useState("ALL");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleDeleteAccount = async () => {
    if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      await deleteAccount();
      navigate("/login");
    }
  };

  const loadUnreadCount = async () => {
    try {
      const res = await getNotifications();
      const notifs = res.data || [];
      setNotifications(notifs);
      const unread = notifs.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenNotifications = async () => {
    setShowNotificationsModal(true);
    setLoadingNotifications(true);
    try {
      const res = await getNotifications();
      setNotifications(res.data || []);
      setUnreadCount((res.data || []).filter((n) => !n.is_read).length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await markNotificationAsRead(notifId);
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notifId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unreadList = notifications.filter((n) => !n.is_read);
      await Promise.all(unreadList.map((n) => markNotificationAsRead(n.notification_id || n.id).catch(() => null)));
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const rawRole = user?.role;
  const normalizedRole = typeof rawRole === "string"
    ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");

  const allNavItems = [
    {
      label: normalizedRole === "admin" ? "Admin Dashboard" : "Dashboard",
      path: "/",
      icon: normalizedRole === "admin" ? null : "📊",
    },
    { label: "Live Tracking", path: "/trips", icon: "🌐" },
    { label: "Shipments", path: "/shipments", icon: "📦", restrictedTo: ["admin", "fleetmanager", "dispatcher", "driver"] },
    { label: "Vehicles", path: "/vehicles", icon: "🚚", restrictedTo: ["admin", "fleetmanager"] },
    { label: "Trips", path: "/trips", icon: "🗺️" },
    { label: "Drivers", path: "/drivers", icon: "👤", restrictedTo: ["admin", "fleetmanager"] },
    { label: "Attendance", path: "/attendance", icon: "📅" },
    { label: "Maintenance", path: "/maintenance", icon: "🛠️", restrictedTo: ["admin", "fleetmanager", "dispatcher", "driver"] },
    { label: "Fuel Refills", path: "/fuel", icon: "⛽", restrictedTo: ["admin", "fleetmanager", "dispatcher", "driver"] },
    { label: "Reports", path: "/reports", icon: "📈", restrictedTo: ["admin", "fleetmanager", "dispatcher"] },
    { label: "Users & Roles", path: "/users", icon: "👥", restrictedTo: ["admin"] },
    { label: "Profile", path: "/profile", icon: "👤" },
  ];

  const navItems = allNavItems.filter((item) => {
    if (!item.restrictedTo) return true;
    return item.restrictedTo.includes(normalizedRole);
  });

  const displayName = (user?.full_name || user?.email?.split("@")[0] || "OPERATOR").toUpperCase();
  const displayRole = (user?.role || "ADMIN").toUpperCase();
  const initial = displayName.charAt(0) || "F";

  const filteredNotifs = notifications.filter((n) => {
    if (filterType === "UNREAD") return !n.is_read;
    const typeStr = (n.type || n.notification_type || "").toLowerCase();
    if (filterType === "MAINTENANCE") return typeStr.includes("maintenance");
    if (filterType === "ALERT") return typeStr.includes("alert") || typeStr.includes("critical") || typeStr.includes("delay");
    return true;
  });

  return (
    <>
      <aside className="w-64 min-h-screen bg-white border-r border-slate-200 flex flex-col justify-between p-5 flex-shrink-0 select-none">
        {/* Top Logo & Notification Bell */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0F766E] text-white flex items-center justify-center font-black text-xl shadow-md shadow-[#0F766E]/20">
                F
              </div>
              <div>
                <h1 className="font-bold text-lg text-slate-900 leading-tight tracking-tight">
                  FleetFlow
                </h1>
                <p className="text-[9px] tracking-widest text-[#0F766E] font-mono font-bold uppercase">
                  OPS CONTROL CENTER
                </p>
              </div>
            </div>

            {/* Global Notification Bell */}
            <button
              onClick={handleOpenNotifications}
              className="relative p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition shadow-sm"
              title="Notifications"
            >
              <span className="text-base">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-[#0F766E] text-white font-mono text-[9px] font-extrabold rounded-full shadow-sm">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1">
            {navItems.map((item, idx) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={idx}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium transition ${
                    isActive
                      ? "bg-[#CCFBF1] text-[#0F766E] font-semibold border border-[#14B8A6]/40 shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-[#CCFBF1]/30 border border-transparent"
                  }`}
                >
                  {item.icon && (
                    <span className="text-base flex items-center justify-center w-5 h-5 flex-shrink-0">{item.icon}</span>
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Profile Section */}
        <div className="border-t border-slate-200 pt-4 space-y-3 mt-auto">
          <Link
            to="/profile"
            className="flex items-center gap-3 p-1.5 -mx-1.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition group cursor-pointer"
            title="View Account Profile"
          >
            <div className="w-10 h-10 rounded-full bg-[#CCFBF1] border border-[#14B8A6]/40 text-[#0F766E] font-bold flex items-center justify-center text-sm shadow-sm group-hover:scale-105 transition">
              {initial}
            </div>
            <div className="overflow-hidden flex-1">
              <h4 className="font-bold text-xs text-slate-900 truncate max-w-[130px] tracking-wide group-hover:text-[#0F766E] transition">
                {displayName}
              </h4>
              <p className="text-[9px] text-[#0F766E] font-mono font-semibold tracking-wider">
                {displayRole}
              </p>
            </div>
            <span className="text-slate-400 group-hover:text-[#0F766E] text-xs font-bold">›</span>
          </Link>

          {/* Action Buttons: LOG OUT & DELETE */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleLogout}
              className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-[10px] font-bold tracking-wider uppercase transition text-center"
            >
              LOG OUT
            </button>
            <button
              onClick={handleDeleteAccount}
              className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-bold tracking-wider uppercase transition text-center"
            >
              DELETE
            </button>
          </div>
        </div>
      </aside>

      {/* Global Notifications Drawer Modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
          <div className="bg-white border-l border-slate-200 w-full max-w-md h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🔔</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                  <p className="text-[10px] text-[#0F766E] font-mono font-semibold">
                    {unreadCount} unread alert{unreadCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold font-mono rounded-lg transition"
                  >
                    Mark All Read ✓
                  </button>
                )}
                <button
                  onClick={() => setShowNotificationsModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 p-2 gap-1 text-xs">
              {[
                { id: "ALL", label: "All" },
                { id: "UNREAD", label: `Unread (${unreadCount})` },
                { id: "MAINTENANCE", label: "Maintenance" },
                { id: "ALERT", label: "Alerts" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1 rounded-lg font-mono text-[11px] transition ${
                    filterType === tab.id
                      ? "bg-white text-[#0F766E] font-bold border border-slate-200 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-3 space-y-2">
              {loadingNotifications ? (
                <div className="p-8 text-center text-xs font-mono text-slate-500">
                  <span className="animate-spin inline-block mr-2">🔄</span> Loading alerts...
                </div>
              ) : filteredNotifs.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-slate-500">
                  No notifications found.
                </div>
              ) : (
                filteredNotifs.map((n) => {
                  const isUnread = !n.is_read;
                  const dateStr = n.created_at
                    ? new Date(n.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";

                  return (
                    <div
                      key={n.notification_id || n.id}
                      className={`p-3.5 rounded-xl border transition space-y-1 ${
                        isUnread
                          ? "bg-[#CCFBF1]/30 border-[#14B8A6]/40"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                            (n.type || "").toLowerCase().includes("critical") || (n.type || "").toLowerCase().includes("delayed")
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : (n.type || "").toLowerCase().includes("maintenance")
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/30"
                          }`}
                        >
                          {n.type || n.notification_type || "INFO"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{dateStr}</span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line font-medium">{n.message}</p>

                      {isUnread && (
                        <div className="pt-1 flex justify-end">
                          <button
                            onClick={() => handleMarkAsRead(n.notification_id || n.id)}
                            className="text-[10px] font-mono text-[#0F766E] hover:text-[#115E59] font-semibold"
                          >
                            Mark as read ✓
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-xs text-slate-500 font-mono">
              <span>Auto-refreshing every 30s</span>
              <button
                onClick={loadUnreadCount}
                className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-700 transition shadow-sm"
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
