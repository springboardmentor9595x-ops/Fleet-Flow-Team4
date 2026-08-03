import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-700 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Fleet Logistics</p>
            <h1 className="mt-2 text-3xl font-semibold">Welcome, {user?.full_name || "User"}</h1>
            <p className="mt-2 text-slate-400">You are now authenticated and can continue building the dashboard.</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
