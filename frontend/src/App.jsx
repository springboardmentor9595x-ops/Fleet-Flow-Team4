import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyOtp from "./pages/VerifyOtp";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Shipments from "./pages/shipment";
import Trips from "./pages/Trips";
import Drivers from "./pages/Drivers";
import Maintenance from "./pages/Maintenance";
import FuelRefills from "./pages/FuelRefills";
import Attendance from "./pages/Attendance";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";
import UsersRoles from "./pages/UsersRoles";
import Vehicles from "./pages/Vehicles";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" />
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* General Protected Routes (Accessible to ALL authenticated roles) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/trips" element={<Trips />} />
              <Route path="/tracking" element={<Trips />} />
              <Route path="/attendance" element={<Attendance />} />
            </Route>

            {/* Administration Only: Users & Role Management */}
            <Route element={<ProtectedRoute allowedRoles={["Admin"]} />}>
              <Route path="/users" element={<UsersRoles />} />
            </Route>

            {/* Operational Management Pages Restricted to Admin & Fleet Manager */}
            <Route element={<ProtectedRoute allowedRoles={["Admin", "FleetManager"]} />}>
              <Route path="/vehicles" element={<Vehicles />} />
              <Route path="/drivers" element={<Drivers />} />
            </Route>

            {/* Maintenance: Admin, FleetManager, Dispatcher (read-only), Driver */}
            <Route element={<ProtectedRoute allowedRoles={["Admin", "FleetManager", "Dispatcher", "Driver"]} />}>
              <Route path="/maintenance" element={<Maintenance />} />
            </Route>

            {/* Fuel Refills: Admin, FleetManager, Dispatcher (read-only), Driver */}
            <Route element={<ProtectedRoute allowedRoles={["Admin", "FleetManager", "Dispatcher", "Driver"]} />}>
              <Route path="/fuel" element={<FuelRefills />} />
            </Route>

            {/* Shipments: Admin, FleetManager, Dispatcher, Driver */}
            <Route element={<ProtectedRoute allowedRoles={["Admin", "FleetManager", "Dispatcher", "Driver"]} />}>
              <Route path="/shipments" element={<Shipments />} />
            </Route>

            {/* Reports & Analytics: Admin, FleetManager, Dispatcher */}
            <Route element={<ProtectedRoute allowedRoles={["Admin", "FleetManager", "Dispatcher"]} />}>
              <Route path="/reports" element={<Reports />} />
            </Route>

            {/* Default Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}