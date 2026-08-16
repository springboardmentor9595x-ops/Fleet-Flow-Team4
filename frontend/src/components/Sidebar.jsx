import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { user, logout, deleteAccount } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  const navItems = [
    { label: "Live Tracking", path: "/trips", icon: "🌐" },
    { label: "Shipments", path: "/shipments", icon: "📦" },
    { label: "Vehicles", path: "/vehicles", icon: "🚚" },
    { label: "Trips", path: "/trips", icon: "🗺️" },
    { label: "Drivers", path: "/drivers", icon: "👤" },
    { label: "Maintenance", path: "/maintenance", icon: "🛠️" },
    { label: "Fuel Refills", path: "/fuel", icon: "⛽" },
  ];

  const displayName = (user?.full_name || user?.email?.split("@")[0] || "OPERATOR").toUpperCase();
  const displayRole = (user?.role || "ADMIN").toUpperCase();
  const initial = displayName.charAt(0) || "F";

  return (
    <aside className="w-64 min-h-screen bg-[#020617] border-r border-slate-800/80 flex flex-col justify-between p-5 flex-shrink-0 select-none">
      {/* Top Logo & Header */}
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-lg shadow-cyan-500/20">
            F
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight tracking-wide">
              FleetFlow
            </h1>
            <p className="text-[9px] tracking-widest text-cyan-400 font-mono font-bold uppercase">
              OPS CONTROL CENTER
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5">
          {navItems.map((item, idx) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={idx}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? "bg-cyan-950/40 border border-cyan-500/50 text-cyan-300 font-semibold shadow-md shadow-cyan-500/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Profile Section */}
      <div className="border-t border-slate-800/80 pt-5 space-y-4 mt-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold flex items-center justify-center text-sm shadow-md">
            {initial}
          </div>
          <div className="overflow-hidden">
            <h4 className="font-bold text-xs text-white truncate max-w-[140px] tracking-wide">
              {displayName}
            </h4>
            <p className="text-[9px] text-cyan-400/80 font-mono font-semibold tracking-wider">
              {displayRole}
            </p>
          </div>
        </div>

        {/* Action Buttons: LOG OUT & DELETE */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleLogout}
            className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-[10px] font-bold tracking-wider uppercase transition text-center"
          >
            LOG OUT
          </button>
          <button
            onClick={handleDeleteAccount}
            className="py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 rounded-xl text-[10px] font-bold tracking-wider uppercase transition text-center"
          >
            DELETE
          </button>
        </div>
      </div>
    </aside>
  );
}
