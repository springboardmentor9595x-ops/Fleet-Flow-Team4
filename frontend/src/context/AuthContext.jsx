import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [loading, setLoading] = useState(true);

  const logout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      setLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((response) => {
        setUser(response.data);
      })
      .catch(() => {
        localStorage.removeItem("token");
        setToken("");
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email, password) => {
    const form = new URLSearchParams();
    form.append("grant_type", "password");
    form.append("username", email.trim());
    form.append("password", password);

    const response = await api.post("/auth/login", form.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const newToken = response.data.access_token;
    localStorage.setItem("token", newToken);
    if (api.defaults.headers.common) {
      api.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    }
    setToken(newToken);

    const me = await api.get("/auth/me", {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    setUser(me.data);
    return me.data;
  };

  const signup = async (formData) => {
    const response = await api.post("/auth/signup", formData);
    return response.data;
  };

  const verifyOtp = async (email, otp) => {
    const response = await api.post("/auth/verify-otp", { email, otp });
    return response.data;
  };

  const resendOtp = async (email) => {
    const response = await api.post("/auth/resend-otp", null, { params: { email } });
    return response.data;
  };

  const deleteAccount = async () => {
    try {
      await api.delete("/auth/me");
    } catch (e) {
      // proceed with logout
    }
    logout();
  };

  const forgotPassword = async (email) => {
    const response = await api.post("/auth/forgot-password", { email });
    return response.data;
  };

  const resetPassword = async (email, otp, new_password) => {
    const response = await api.post("/auth/reset-password", { email, otp, new_password });
    return response.data;
  };

  const value = useMemo(
    () => ({ user, token, loading, login, signup, verifyOtp, resendOtp, logout, deleteAccount, forgotPassword, resetPassword }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
