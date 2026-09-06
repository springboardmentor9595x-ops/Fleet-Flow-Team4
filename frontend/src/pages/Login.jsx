import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(form.email, form.password);
      toast.success("Login Successful!");
      navigate("/dashboard");
    } catch (err) {
      let message = "Invalid email or password";
      if (!err.response) {
        message = "Cannot connect to server. Please ensure backend is running.";
      } else if (err.response.status >= 500) {
        message = "Server error occurred. Please try again later.";
      } else if (err.response.data?.detail) {
        message = err.response.data.detail;
      }

      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0FDFA] px-4 py-12 font-sans">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#E5E7EB] p-8 shadow-xl">
        {/* Brand Logo & Title */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F766E] text-white font-black text-2xl shadow-md shadow-[#0F766E]/20">
            F
          </div>
          <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">
            FleetFlow Login
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            Sign in to access your fleet operations workspace
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#1F2937] mb-1.5 uppercase tracking-wider text-[11px] font-mono">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-3 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
              placeholder="operator@company.com"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block font-semibold text-[#1F2937] uppercase tracking-wider text-[11px] font-mono">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[11px] font-semibold text-[#0F766E] hover:underline transition"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                value={form.password}
                onChange={handleChange}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-3 pr-11 text-[#1F2937] placeholder-[#6B7280] focus:bg-white focus:outline-none focus:border-[#0F766E] transition font-mono"
                placeholder="••••••••"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0F766E] py-3 font-bold text-white shadow-md shadow-[#0F766E]/20 hover:bg-[#115E59] transition disabled:opacity-50 text-sm mt-2 font-mono"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#E5E7EB] text-center text-xs text-[#6B7280]">
          Don't have an account?{" "}
          <Link
            to="/signup"
            className="font-bold text-[#0F766E] hover:underline transition"
          >
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  );
}