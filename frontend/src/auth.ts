/**
 * auth.ts
 * ======================================================
 * EarthWatch AI — Frontend Authentication & Session State
 * ======================================================
 * Manages JWT access tokens, authenticated user profile,
 * Axios request/response interceptors, and session lifecycle.
 */

import axios from "axios";

export type UserRole = "ADMIN" | "ANALYST";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active?: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  accessToken: string | null;
  role: UserRole | null;
}

const TOKEN_KEY = "earthwatch_access_token";
const USER_KEY = "earthwatch_auth_user";
const REMEMBER_KEY = "earthwatch_remember_me";

// Active in-memory auth state
let state: AuthState = {
  isAuthenticated: false,
  currentUser: null,
  accessToken: null,
  role: null,
};

type AuthListener = (state: AuthState) => void;
const listeners: AuthListener[] = [];

export function getAuthState(): AuthState {
  return { ...state };
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notifyListeners() {
  const current = getAuthState();
  listeners.forEach((fn) => fn(current));
}

/**
 * Read token from either sessionStorage or localStorage based on rememberMe.
 */
function readStoredToken(): { token: string | null; user: AuthUser | null } {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY) === "true";
    const storage = remember ? localStorage : sessionStorage;

    let token = storage.getItem(TOKEN_KEY);
    let userStr = storage.getItem(USER_KEY);

    // Fallback: check sessionStorage if not in localStorage or vice versa
    if (!token) {
      token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
      userStr = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    }

    if (token && userStr) {
      const user = JSON.parse(userStr) as AuthUser;
      return { token, user };
    }
  } catch (err) {
    console.warn("Failed reading stored authentication session:", err);
  }
  return { token: null, user: null };
}

/**
 * Save auth session to appropriate storage.
 */
function saveSession(token: string, user: AuthUser, rememberMe: boolean) {
  try {
    // Clear both storages first to prevent stale sync issues
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, "true");
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  } catch (err) {
    console.warn("Failed writing authentication session:", err);
  }
}

/**
 * Clear all storage keys for authentication.
 */
function clearSessionStorage() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  } catch (err) {
    console.warn("Failed clearing authentication storage:", err);
  }
}

/**
 * Configure Axios global interceptors for Bearer Token injection and 401 handling.
 */
let interceptorsConfigured = false;

export function setupAxiosInterceptors(onUnauthorized?: () => void) {
  if (interceptorsConfigured) return;
  interceptorsConfigured = true;

  // Request Interceptor: inject Authorization header
  axios.interceptors.request.use(
    (config) => {
      const token = state.accessToken;
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response Interceptor: detect 401 expired/invalid tokens
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const url = error.config?.url || "";
      // If 401 on /auth/login, do not clear state (login credentials were invalid)
      if (error.response?.status === 401 && !url.includes("/auth/login")) {
        console.warn("Session expired or unauthorized (401). Resetting session.");
        clearSession();
        if (onUnauthorized) {
          onUnauthorized();
        }
      }
      return Promise.reject(error);
    }
  );
}

/**
 * Login user via backend API.
 */
export async function loginUser(
  backendUrl: string,
  credentials: { email: string; password: string; rememberMe: boolean }
): Promise<AuthUser> {
  const endpoint = `${backendUrl}/auth/login`;
  const response = await axios.post(endpoint, {
    email: credentials.email.trim(),
    password: credentials.password,
  });

  const { access_token, user } = response.data;

  // Update in-memory state
  state = {
    isAuthenticated: true,
    currentUser: user,
    accessToken: access_token,
    role: user.role,
  };

  saveSession(access_token, user, credentials.rememberMe);
  notifyListeners();
  return user;
}

/**
 * Logout user: notifies backend, clears storage, resets in-memory state.
 */
export async function logoutUser(backendUrl?: string) {
  if (backendUrl && state.accessToken) {
    try {
      await axios.post(
        `${backendUrl}/auth/logout`,
        {},
        {
          headers: {
            Authorization: `Bearer ${state.accessToken}`,
          },
        }
      );
    } catch {
      // Best-effort logout: ignore network/server errors during logout
    }
  }

  clearSession();
}

/**
 * Clear in-memory and persisted state.
 */
export function clearSession() {
  clearSessionStorage();
  state = {
    isAuthenticated: false,
    currentUser: null,
    accessToken: null,
    role: null,
  };
  notifyListeners();
}

/**
 * Validate existing stored session against backend GET /api/auth/me.
 */
export async function checkStoredSession(backendUrl: string): Promise<AuthUser | null> {
  const { token } = readStoredToken();
  if (!token) {
    clearSession();
    return null;
  }

  // Pre-seed state so Authorization header can be attached
  state.accessToken = token;

  try {
    const res = await axios.get(`${backendUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const activeUser = res.data as AuthUser;
    state = {
      isAuthenticated: true,
      currentUser: activeUser,
      accessToken: token,
      role: activeUser.role,
    };
    notifyListeners();
    return activeUser;
  } catch (err) {
    console.warn("Stored session token is invalid or expired. Clearing session.", err);
    clearSession();
    return null;
  }
}
