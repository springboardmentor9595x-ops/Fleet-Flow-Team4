import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import { getAdminUsers, updateUserRole } from "../api/users";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

const ROLE_BADGE_STYLES = {
  Admin: "bg-[#CCFBF1] text-[#0F766E] border border-[#14B8A6]/40",
  FleetManager: "bg-blue-50 text-blue-700 border-blue-200",
  Dispatcher: "bg-amber-50 text-amber-700 border-amber-200",
  Driver: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const ALL_ROLES = ["Admin", "FleetManager", "Dispatcher", "Driver"];

export default function UsersRoles() {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Role change modal state
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminUsers();
      setUsers(res.data || []);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load registered users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openChangeRoleModal = (user) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setError("");
    setSuccess("");
  };

  const closeChangeRoleModal = () => {
    setSelectedUser(null);
    setNewRole("");
  };

  const handleRoleChangeSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !newRole) return;

    if (selectedUser.user_id === currentAdmin?.user_id && newRole !== "Admin") {
      setError("Administrators cannot change or demote their own account role.");
      toast.error("You cannot demote your own Admin role.");
      return;
    }

    try {
      setModalLoading(true);
      setError("");
      await updateUserRole(selectedUser.user_id, newRole);
      setSuccess(`Role for ${selectedUser.full_name} successfully updated to ${newRole}!`);
      toast.success(`Role updated to ${newRole}!`);
      closeChangeRoleModal();
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update user role");
      toast.error(err.response?.data?.detail || "Failed to update user role");
    } finally {
      setModalLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchQuery ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.assigned_vehicle?.registration_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === "Admin").length;
  const fmCount = users.filter((u) => u.role === "FleetManager").length;
  const dispCount = users.filter((u) => u.role === "Dispatcher").length;
  const driverCount = users.filter((u) => u.role === "Driver").length;

  return (
    <div className="flex min-h-screen bg-white text-slate-900 font-sans overflow-x-hidden">
      <Sidebar />

      <main className="flex-1 p-8 space-y-6 overflow-y-auto bg-white">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Users & Role Access</h1>
            <p className="text-xs font-mono font-bold tracking-wider text-blue-600 uppercase mt-1">
              REAL DATABASE USERS, CREDENTIAL STATUS & RBAC PERMISSIONS
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition flex items-center gap-2"
            >
              <span className={loading ? "animate-spin" : ""}>🔄</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono rounded-xl flex justify-between items-center">
            <span>✓ {success}</span>
            <button onClick={() => setSuccess("")} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>
        )}

        {/* Metrics Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-wider">TOTAL USERS</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalUsers}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-[#0F766E] font-bold uppercase tracking-wider">ADMINS</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{adminCount}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-wider">FLEET MANAGERS</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{fmCount}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-amber-600 font-bold uppercase tracking-wider">DISPATCHERS</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{dispCount}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-center">
            <p className="text-[10px] font-mono text-emerald-600 font-bold uppercase tracking-wider">DRIVERS</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{driverCount}</p>
          </div>
        </div>

        {/* Controls Toolbar: Search & Role Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="flex-1 min-w-[240px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, phone, or assigned vehicle..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: "ALL", label: "All Users" },
                { id: "Admin", label: "Admin" },
                { id: "FleetManager", label: "Fleet Manager" },
                { id: "Dispatcher", label: "Dispatcher" },
                { id: "Driver", label: "Driver" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRoleFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl font-mono text-xs transition ${
                    roleFilter === tab.id
                      ? "bg-blue-600 text-white font-bold shadow-sm"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
              <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wide">
                Registered Accounts ({filteredUsers.length} Users)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Source: PostgreSQL Real Database
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono">
                <tr>
                  <th className="p-3.5 font-bold uppercase text-[10px] tracking-wider">User Name</th>
                  <th className="p-3.5 font-bold uppercase text-[10px] tracking-wider">Email Address</th>
                  <th className="p-3.5 font-bold uppercase text-[10px] tracking-wider">Role</th>
                  <th className="p-3.5 font-bold uppercase text-[10px] tracking-wider">Account Status</th>
                  <th className="p-3.5 font-bold uppercase text-[10px] tracking-wider">Assigned Vehicle</th>
                  <th className="p-3.5 font-bold uppercase text-[10px] tracking-wider">Created Date</th>
                  <th className="p-3.5 font-bold uppercase text-[10px] tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-mono">
                      <span className="animate-spin inline-block mr-2">🔄</span> Loading database users...
                    </td>
                  </tr>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const badgeClass = ROLE_BADGE_STYLES[u.role] || "bg-slate-100 text-slate-700 border-slate-200";
                    const isSelf = u.user_id === currentAdmin?.user_id;

                    return (
                      <tr key={u.user_id} className="hover:bg-slate-50 transition">
                        {/* Name & Initials */}
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 font-bold flex items-center justify-center text-xs">
                              {u.full_name?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{u.full_name}</span>
                                {isSelf && (
                                  <span className="text-[9px] font-mono bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                    YOU
                                  </span>
                                )}
                              </p>
                              {u.phone && <p className="text-[10px] text-slate-400">{u.phone}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="p-3.5 text-slate-700 whitespace-nowrap">
                          {u.email}
                        </td>

                        {/* Role Badge */}
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border font-mono ${badgeClass}`}>
                            {u.role === "FleetManager" ? "Fleet Manager" : u.role}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            u.is_verified
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {u.account_status || (u.is_verified ? "Active" : "Unverified")}
                          </span>
                        </td>

                        {/* Assigned Vehicle */}
                        <td className="p-3.5 whitespace-nowrap text-slate-700">
                          {u.role === "Driver" ? (
                            u.assigned_vehicle ? (
                              <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-[10px]">
                                🚚 {u.assigned_vehicle.display_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="p-3.5 text-slate-500 whitespace-nowrap">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 whitespace-nowrap text-right">
                          <button
                            onClick={() => openChangeRoleModal(u)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ml-auto"
                          >
                            <span>⚙️</span>
                            <span>Change Role</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-mono">
                      No users found matching your filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Change Role Modal */}
        {selectedUser && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
                    Manage User Role
                  </h3>
                </div>
                <button
                  onClick={closeChangeRoleModal}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                >
                  ✕
                </button>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-xs font-mono">
                <p className="font-bold text-slate-900">{selectedUser.full_name}</p>
                <p className="text-slate-500">{selectedUser.email}</p>
                <p className="text-slate-600 pt-1">
                  Current Role: <strong className="text-blue-600">{selectedUser.role}</strong>
                </p>
              </div>

              <form onSubmit={handleRoleChangeSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">
                    Select New Role *
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r === "FleetManager" ? "Fleet Manager" : r}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedUser.user_id === currentAdmin?.user_id && newRole !== "Admin" && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl font-mono">
                    ⚠️ You are logged in as this administrator. You cannot demote your own account.
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeChangeRoleModal}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold font-mono rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading || (selectedUser.user_id === currentAdmin?.user_id && newRole !== "Admin")}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold font-mono rounded-xl shadow-sm transition disabled:opacity-50"
                  >
                    {modalLoading ? "Saving..." : "Update Role"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
