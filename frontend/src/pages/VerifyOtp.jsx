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
      toast.success("Email verified successfully.");
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/50">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-semibold text-white">Verify your email</h2>
          <p className="mt-2 text-sm text-slate-400">Enter the 6-digit code sent to {email || "your email"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-300">Verification code</label>
            <input
              type="text"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400"
              placeholder="123456"
            />
          </div>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Verifying..." : "Verify account"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resending}
            className="font-medium text-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {resending ? "Sending..." : "Resend OTP"}
          </button>
          <p className="mt-3">
            <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default VerifyOtpPage;
