import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyOtp, resendOtp } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const [otp, setOtp] = useState(searchParams.get("otp") || "");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const email = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const pendingEmail = location.state?.email || searchParams.get("email") || localStorage.getItem("pendingVerificationEmail") || "";
    return pendingEmail;
  }, [location.search, location.state?.email]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!email) {
      const message = "Missing email. Please sign up again.";
      setError(message);
      toast.error(message);
      return;
    }

    setLoading(true);

    try {
      await verifyOtp(email, otp);
      localStorage.removeItem("pendingVerificationEmail");
      toast.success("Email verified successfully!");
      navigate("/login");
    } catch (err) {
      const message = err.response?.data?.detail || "Verification failed.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email) {
      const message = "Missing email. Please sign up again.";
      setError(message);
      toast.error(message);
      return;
    }

    setResending(true);
    setError("");

    try {
      const response = await resendOtp(email);
      toast.success(response.message || "A new verification code has been sent.");
    } catch (err) {
      const message = err.response?.data?.detail || "Unable to resend verification code.";
      setError(message);
      toast.error(message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0FDFA] px-4 py-12 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F766E] text-white font-black text-2xl shadow-md shadow-[#0F766E]/20">
            F
          </div>
          <h2 className="text-2xl font-bold text-[#1F2937] tracking-tight">Verify Your Email</h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Enter the 6-digit verification code sent to <strong className="text-[#0F766E]">{email || "your email"}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="mb-1.5 block font-semibold uppercase tracking-wider text-[11px] text-[#1F2937] font-mono">
              Verification Code
            </label>
            <input
              type="text"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
              maxLength={6}
              className="w-full rounded-xl border border-[#E5E7EB] bg-[#F0FDFA] px-4 py-3 text-[#1F2937] outline-none focus:bg-white focus:border-[#0F766E] transition font-mono tracking-widest text-center text-lg font-bold"
              placeholder="••••••"
            />
          </div>

          {error ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0F766E] py-3 font-bold text-white shadow-md shadow-[#0F766E]/20 hover:bg-[#115E59] transition disabled:cursor-not-allowed disabled:opacity-50 text-sm font-mono"
          >
            {loading ? "Verifying Code..." : "Verify & Activate Account"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-[#6B7280]">
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resending}
            className="font-bold text-[#0F766E] hover:underline disabled:opacity-50"
          >
            {resending ? "Sending New Code..." : "Resend Verification Code"}
          </button>
          <p className="mt-4 pt-4 border-t border-[#E5E7EB]">
            <Link to="/login" className="font-semibold text-[#6B7280] hover:text-[#1F2937] transition">
              ← Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default VerifyOtpPage;
