import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";

function SignupForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    full_name: "",
    phone: "",
    role: "Driver",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const validatePassword = (password) => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long.";
    }

    if (!/\d/.test(password)) {
      return "Password must include at least one number.";
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      return "Password must include at least one special character.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const trimmedName = formData.full_name.trim();
    const trimmedEmail = formData.email.trim();
    const passwordError = validatePassword(formData.password);

    if (!trimmedName) {
      const message = "Name is required.";
      setError(message);
      toast.error(message);
      return;
    }

    if (!trimmedEmail) {
      const message = "Email is required.";
      setError(message);
      toast.error(message);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      const message = "Passwords do not match.";
      setError(message);
      toast.error(message);
      return;
    }

    if (passwordError) {
      setError(passwordError);
      toast.error(passwordError);
      return;
    }

    setLoading(true);

    try {
      const payload = {
        email: trimmedEmail,
        password: formData.password,
        full_name: trimmedName,
        phone: formData.phone,
        role: formData.role,
      };

      await signup(payload);
      localStorage.setItem("pendingVerificationEmail", trimmedEmail);
      toast.success("Account created successfully. Please verify your email.");
      navigate("/verify-otp", { state: { email: trimmedEmail } });
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message || "Sign up failed.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-slate-900">Create an account</h2>
        <p className="mt-1 text-sm text-slate-500">Join the fleet operations platform</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Name</label>
          <input
            type="text"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder-slate-400 focus:bg-white focus:border-blue-500 transition"
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder-slate-400 focus:bg-white focus:border-blue-500 transition"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Phone</label>
          <input
            type="text"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder-slate-400 focus:bg-white focus:border-blue-500 transition"
            placeholder="(555) 123-4567"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder-slate-400 focus:bg-white focus:border-blue-500 transition"
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Confirm Password</label>
          <input
            type="password"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder-slate-400 focus:bg-white focus:border-blue-500 transition"
            placeholder="Re-enter password"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Role</label>
          <select
            name="role"
            value={formData.role}
            onChange={handleChange}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:bg-white focus:border-blue-500 transition"
          >
            <option value="Driver">Driver</option>
            <option value="FleetManager">Manager</option>
            <option value="Admin">Admin</option>
          </select>
        </div>

        {error ? <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="mt-6 space-y-2 text-center text-xs text-slate-500">
        <p>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
            Sign in
          </Link>
        </p>
        <p>
          Already signed up?{' '}
          <Link
            to={`/verify-otp${formData.email ? `?email=${encodeURIComponent(formData.email)}` : ""}`}
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            Verify OTP
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SignupForm;
        