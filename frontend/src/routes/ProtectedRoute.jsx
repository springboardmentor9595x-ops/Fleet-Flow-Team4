import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function ProtectedRoute({ allowedRoles }) {
  const { user, loading, token } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-slate-700 font-mono text-sm">Loading FleetFlow...</div>;
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const rawRole = user.role;
    const userRole = typeof rawRole === "string"
      ? rawRole.trim().toLowerCase().replace(/[\s_-]+/g, "")
      : (rawRole?.value || "").toLowerCase().replace(/[\s_-]+/g, "");

    const normalizedAllowed = allowedRoles.map((r) =>
      r.trim().toLowerCase().replace(/[\s_-]+/g, "")
    );

    if (!normalizedAllowed.includes(userRole)) {
      return <Navigate to="/" replace />;
    }
  }

  return <Outlet />;
}

export default ProtectedRoute;
