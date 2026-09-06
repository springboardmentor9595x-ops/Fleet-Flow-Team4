import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function ForgotPassword() {
  const { forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Enter Email, 2: Enter OTP & New Password
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await forgotPassword(email.trim());
      toast.success("Verification code sent to your email!");
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to send reset code. Please check your email.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await resetPassword(email.trim(), otp.trim(), newPassword);
      toast.success("Password reset successfully! Please log in.");
      navigate("/login");
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to reset password. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-8 w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl mx-auto shadow-md shadow-blue-500/20">
            F
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {step === 1 ? "Forgot Password" : "Reset Password"}
          </h1>
          <p className="text-slate-500 text-xs">
            {step === 1
              ? "Enter your email to receive a secure verification code"
              : "Enter the code sent to your email and your new password"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          <div className={`flex-1 h-1.5 rounded-full ${step >= 1 ? "bg-blue-600" : "bg-slate-200"}`} />
          <div className={`flex-1 h-1.5 rounded-full ${step >= 2 ? "bg-blue-600" : "bg-slate-200"}`} />
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Step 1 — Enter Email */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} className="space-y-4 text-xs">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 mb-1.5 block uppercase tracking-wide">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your registered email"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs tracking-wide transition shadow-md shadow-blue-500/20 disabled:opacity-50"
            >
              {loading ? "Sending Code..." : "Send Verification Code"}
            </button>
          </form>
        )}

        {/* Step 2 — Enter OTP & New Password */}
        {step === 2 && (
          <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 mb-1.5 block uppercase tracking-wide">
                Verification Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter 6-digit code"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition font-mono tracking-widest text-center text-sm"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 mb-1.5 block uppercase tracking-wide">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1 text-sm select-none"
                >
                  {showPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 mb-1.5 block uppercase tracking-wide">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1 text-sm select-none"
                >
                  {showConfirmPassword ? "👁️" : "🙈"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs tracking-wide transition shadow-md shadow-blue-500/20 disabled:opacity-50"
            >
              {loading ? "Resetting Password..." : "Reset Password"}
            </button>

            <button
              type="button"
              onClick={() => { setStep(1); setError(""); setOtp(""); setNewPassword(""); setConfirmPassword(""); }}
              className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold transition"
            >
              ← Back to email entry
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="text-center pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Remember your password?{" "}
            <Link to="/login" className="text-blue-600 hover:underline font-bold">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
