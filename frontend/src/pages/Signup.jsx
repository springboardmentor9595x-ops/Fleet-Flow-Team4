import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    address: "",
    email: "",
    role: "FleetManager",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // 1. Required field validations
    if (!form.full_name.trim()) {
      setError("Full Name is required.");
      return;
    }
    if (!form.phone.trim()) {
      setError("Phone Number is required.");
      return;
    }
    const phoneClean = form.phone.replace(/[\s\-]/g, "");
    if (!/^\+?[0-9]{7,15}$/.test(phoneClean)) {
      setError("Please enter a valid phone number (e.g. +91 9876543210).");
      return;
    }
    if (!form.address.trim()) {
      setError("Address is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("Email Address is required.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Password and Confirm Password do not match.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        password: form.password,
        confirm_password: form.confirmPassword,
      };

      await signup(payload);
      localStorage.setItem("pendingVerificationEmail", form.email.trim().toLowerCase());
      toast.success("Verification code sent to your email!");
      navigate("/verify-otp", { state: { email: form.email.trim().toLowerCase() } });
    } catch (err) {
      const message = err.response?.data?.detail || "Registration failed. Please check your inputs.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0FDFA] px-4 py-12 font-sans">
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#E5E7EB] p-8 shadow-xl">
        {/* Brand Logo & Title */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F766E] text-white font-black text-2xl shadow-md shadow-[#0F766E]/20">
            F
          </div>
          <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">
            Create FleetFlow Account
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            Register your profile to access fleet & logistics management
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
              Full Name *
            </label>
            <input
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              required
              placeholder="e.g. Sarah Jenkins"
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-2.5 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="name@company.com"
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-2.5 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
                Phone Number *
              </label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                required
                placeholder="+91 9876543210"
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-2.5 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
              Address *
            </label>
            <input
              name="address"
              value={form.address}
              onChange={handleChange}
              required
              placeholder="e.g. 124 Logistics Park, Sector 5"
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-2.5 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
              Role *
            </label>
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-2.5 text-[#1F2937] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono font-medium"
            >
              <option value="FleetManager">Fleet Manager (Fleet & Asset Ops)</option>
              <option value="Dispatcher">Dispatcher (Logistics & Shipments)</option>
              <option value="Driver">Driver (Field Transit Operations)</option>
              <option value="Admin">Administrator (Full Access)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  placeholder="Min 6 chars"
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-2.5 pr-11 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937] transition p-1 text-sm select-none"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
                Confirm Password *
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  placeholder="Repeat password"
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-2.5 pr-11 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937] transition p-1 text-sm select-none"
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0F766E] py-3 font-bold text-white shadow-md shadow-[#0F766E]/20 hover:bg-[#115E59] transition disabled:opacity-50 text-sm mt-3 font-mono"
          >
            {loading ? "Sending Verification Code..." : "Create Account & Send Code"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#E5E7EB] text-center text-xs text-[#6B7280]">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-bold text-[#0F766E] hover:underline transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}