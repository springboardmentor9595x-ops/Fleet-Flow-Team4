import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyOtp from "./pages/VerifyOtp";
import Dashboard from "./pages/Dashboard";
import Shipments from "./pages/shipment";
import Trips from "./pages/Trips";
import Drivers from "./pages/Drivers";
import Maintenance from "./pages/Maintenance";
import FuelRefills from "./pages/FuelRefills";

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

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/vehicles" element={<Dashboard />} />
              <Route path="/shipments" element={<Shipments />} />
              <Route path="/trips" element={<Trips />} />
              <Route path="/tracking" element={<Trips />} />
              <Route path="/drivers" element={<Drivers />} />
              <Route path="/maintenance" element={<Maintenance />} />
              <Route path="/fuel" element={<FuelRefills />} />
            </Route>

            {/* Default Route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}