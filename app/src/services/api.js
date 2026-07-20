import axios from "axios";

const rawUrl = process.env.REACT_APP_API_URL || "https://caponlinebackend.onrender.com";
const API_URL = rawUrl.endsWith('/api') ? rawUrl : `${rawUrl.replace(/\/$/, '')}/api`;

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

// ── REQUEST interceptor — reads fresh token on EVERY call ────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      if (config.headers && typeof config.headers.set === 'function') {
        config.headers.set('Authorization', `Bearer ${token}`);
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── RESPONSE interceptor — auto-logout on non-login 401 errors (expired/invalid token) ──
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    const isLoginUrl = url.includes("/auth/login") || url === "/login";
    // Background refresh calls (fetchMe) should NEVER trigger auto-logout —
    // they run during Render cold starts and transient 401s should not evict the session
    const isBackgroundRefresh = error.config?._isBackgroundRefresh === true;

    if (status === 401 && !isLoginUrl && !isBackgroundRefresh) {
      let user = null;
      try { user = JSON.parse(localStorage.getItem('user')); } catch (e) { }

      // Never auto-logout admin
      if (user && user.role === 'admin') {
        console.warn('Admin received 401, preventing auto-logout');
        return Promise.reject(error);
      }

      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("portal_user");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default api;
