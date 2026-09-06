import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { getProfile, updateProfile } from "../api/users";
import toast from "react-hot-toast";

const ROLE_BADGE_STYLES = {
  Admin: "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/40",
  FleetManager: "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/30",
  Dispatcher: "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/30",
  Driver: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function Profile() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getProfile();
      setProfile(res.data);
      setFullName(res.data.full_name || "");
      setPhone(res.data.phone || "");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load user profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    try {
      setEditLoading(true);
      setError("");
      setSuccess("");
      const res = await updateProfile({ full_name: fullName.trim(), phone: phone.trim() });
      setProfile(res.data);
      setSuccess("Profile details updated successfully!");
      toast.success("Profile updated successfully!");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update profile details");
      toast.error(err.response?.data?.detail || "Failed to update profile");
    } finally {
      setEditLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      setPwLoading(true);
      setError("");
      setSuccess("");
      await updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated successfully!");
      toast.success("Password updated successfully!");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update password");
      toast.error(err.response?.data?.detail || "Failed to update password");
    } finally {
      setPwLoading(false);
    }
  };

  const role = profile?.role || authUser?.role || "Driver";
  const badgeStyle = ROLE_BADGE_STYLES[role] || "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <div className="flex min-h-screen bg-[#F0FDFA] text-[#1F2937] font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-[#F0FDFA]">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1F2937] tracking-tight">Account Profile</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-[#0F766E] uppercase mt-1">
              REAL USER CREDENTIALS & FLEET PROFILE MANAGEMENT
            </p>
          </div>

          <button
            onClick={fetchProfileData}
            disabled={loading}
            className="px-4 py-2 bg-white border border-[#E5E7EB] rounded-xl text-[#1F2937] hover:bg-[#CCFBF1]/50 text-xs font-semibold shadow-xs transition flex items-center gap-2"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-[#6B7280] hover:text-[#1F2937]">✕</button>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>✓ {success}</span>
            <button onClick={() => setSuccess("")} className="text-[#6B7280] hover:text-[#1F2937]">✕</button>
          </div>
        )}

        {loading ? (
          <div className="p-16 text-center text-[#6B7280] font-mono text-xs">
            <span className="animate-spin inline-block mr-2">🔄</span> Loading profile data...
          </div>
        ) : profile ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Profile Card & Role Info */}
            <div className="lg:col-span-1 space-y-6">
              {/* Identity Card */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-full bg-[#CCFBF1] border-2 border-[#14B8A6]/40 text-[#0F766E] font-extrabold text-2xl flex items-center justify-center shadow-inner">
                  {profile.full_name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#1F2937]">{profile.full_name}</h2>
                  <p className="text-xs text-[#6B7280] font-mono mt-0.5">{profile.email}</p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border font-mono ${badgeStyle}`}>
                    {role}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border font-mono ${
                    profile.is_verified ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                    {profile.account_status || (profile.is_verified ? "Active" : "Unverified")}
                  </span>
                </div>

                <div className="border-t border-[#E5E7EB] pt-4 text-left space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B7280] font-mono">User ID:</span>
                    <span className="font-mono text-[11px] text-[#1F2937] truncate max-w-[160px]" title={profile.user_id}>
                      {profile.user_id}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B7280] font-mono">Phone:</span>
                    <span className="font-mono text-[#1F2937] font-semibold">{profile.phone || "Not provided"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#6B7280] font-mono">Registered:</span>
                    <span className="font-mono text-[#6B7280]">
                      {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Assigned Vehicle Card (Driver Only - Read Only) */}
              {role === "Driver" && (
                <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚚</span>
                    <h3 className="text-xs font-bold text-[#1F2937] font-mono uppercase tracking-wide">
                      Assigned Fleet Vehicle (View Only)
                    </h3>
                  </div>
                  {profile.assigned_vehicle ? (
                    <div className="bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl p-3.5 space-y-1.5 font-mono text-xs">
                      <p className="font-bold text-[#1F2937] text-sm">
                        {profile.assigned_vehicle.registration_number}
                      </p>
                      <p className="text-[#6B7280] text-[11px]">
                        {profile.assigned_vehicle.brand} {profile.assigned_vehicle.model}
                      </p>
                      <p className="text-[10px] text-[#0F766E] font-semibold uppercase">
                        Type: {profile.assigned_vehicle.vehicle_type}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl text-center text-xs text-[#6B7280] font-mono">
                      No vehicle currently assigned. Contact Fleet Manager.
                    </div>
                  )}
                </div>
              )}

              {/* Role Protection Notice */}
              <div className="bg-[#CCFBF1]/40 border border-[#14B8A6]/30 rounded-2xl p-4 text-xs space-y-2">
                <div className="flex items-center gap-2 text-[#0F766E] font-bold font-mono">
                  <span>🔒</span>
                  <span>Role & Email Security Policy</span>
                </div>
                <p className="text-[#0F766E] leading-relaxed text-[11px]">
                  Your role is <strong>{role}</strong> and registered email is <strong>{profile.email}</strong>. In accordance with system security rules, registered emails, role assignments, and vehicle assignments are <strong>read-only</strong>. Only a system <strong>Admin</strong> can adjust account roles.
                </p>
              </div>
            </div>

            {/* Right Column: Edit Profile & Password Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Edit Details Form */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs space-y-4">
                <div className="border-b border-[#E5E7EB] pb-3">
                  <h3 className="text-sm font-bold text-[#1F2937] font-mono uppercase tracking-wide">
                    Edit Profile Details
                  </h3>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Update your display name and contact phone number.
                  </p>
                </div>

                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#1F2937] mb-1.5 font-mono">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="w-full bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-mono text-[#1F2937] focus:bg-white focus:outline-none focus:border-[#0F766E]"
                        placeholder="Your full name"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#1F2937] mb-1.5 font-mono">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-mono text-[#1F2937] focus:bg-white focus:outline-none focus:border-[#0F766E]"
                        placeholder="Phone number"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#6B7280] mb-1.5 font-mono">
                        Email Address (View Only)
                      </label>
                      <input
                        type="email"
                        value={profile.email}
                        disabled
                        readOnly
                        className="w-full bg-slate-100 border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-mono text-[#6B7280] cursor-not-allowed select-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#6B7280] mb-1.5 font-mono">
                        Account Role (View Only)
                      </label>
                      <input
                        type="text"
                        value={role}
                        disabled
                        readOnly
                        className="w-full bg-slate-100 border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-mono text-[#6B7280] cursor-not-allowed select-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={editLoading}
                      className="px-5 py-2 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-bold font-mono rounded-xl shadow-xs transition disabled:opacity-50"
                    >
                      {editLoading ? "Saving Changes..." : "Save Profile Details"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Secure Change Password */}
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs space-y-4">
                <div className="border-b border-[#E5E7EB] pb-3">
                  <h3 className="text-sm font-bold text-[#1F2937] font-mono uppercase tracking-wide">
                    Change Password
                  </h3>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Securely update your password using bcrypt verification.
                  </p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#1F2937] mb-1.5 font-mono">
                      Current Password *
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-mono text-[#1F2937] focus:bg-white focus:outline-none focus:border-[#0F766E]"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#1F2937] mb-1.5 font-mono">
                        New Password *
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-mono text-[#1F2937] focus:bg-white focus:outline-none focus:border-[#0F766E]"
                        placeholder="At least 6 characters"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#1F2937] mb-1.5 font-mono">
                        Confirm New Password *
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full bg-[#F0FDFA] border border-[#E5E7EB] rounded-xl px-3.5 py-2 text-xs font-mono text-[#1F2937] focus:bg-white focus:outline-none focus:border-[#0F766E]"
                        placeholder="Re-enter new password"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={pwLoading}
                      className="px-5 py-2 bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-bold font-mono rounded-xl shadow-xs transition disabled:opacity-50"
                    >
                      {pwLoading ? "Updating Password..." : "Update Password"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
