import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const storage = {
  get: (k: string) => Platform.OS === "web" ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k),
  set: (k: string, v: string) => Platform.OS === "web" ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v),
  del: (k: string) => Platform.OS === "web" ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k),
};

const API = process.env.EXPO_PUBLIC_BACKEND_URL || "https://tribuquest-backend.onrender.com";
export const BACKEND_URL = API;

function mapError(body: any, status: number): Error {
  const msg = body?.detail || body?.message || `HTTP ${status}`;
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return new Error(msg);
  }
  if (status === 401) return new Error("Session expirée. Veuillez vous reconnecter.");
  if (status === 403) return new Error("Accès refusé.");
  if (status === 404) return new Error("Ressource introuvable.");
  if (status >= 500) return new Error("Erreur serveur. Veuillez réessayer plus tard.");
  return new Error("Une erreur est survenue.");
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.get("access_token");
  const pinToken = await storage.get("parent_pin_token");
  const headers: any = { "Content-Type": "application/json", ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (pinToken) headers["X-Parent-Pin-Token"] = pinToken;
  let cleanPath = path;
  if (!cleanPath.startsWith("http")) {
    if (!cleanPath.startsWith("/api")) {
      cleanPath = `/api${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
    }
  }
  const url = cleanPath.startsWith("http") ? cleanPath : `${API}${cleanPath}`;
  const r = await fetch(url, { ...init, headers });
  const text = await r.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) throw mapError(body, r.status);
  return body;
}

export const api = {
  get: <T=any>(p: string) => request<T>(p),
  post: <T=any>(p: string, body?: any) => request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T=any>(p: string, body?: any) => request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T=any>(p: string, body?: any) => request<T>(p, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
  upload: async <T=any>(p: string, form: FormData): Promise<T> => {
    const token = await storage.get("access_token");
    const pinToken = await storage.get("parent_pin_token");
    const headers: any = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (pinToken) headers["X-Parent-Pin-Token"] = pinToken;
    let cleanPath = p;
    if (!cleanPath.startsWith("http")) {
      if (!cleanPath.startsWith("/api")) {
        cleanPath = `/api${cleanPath.startsWith("/") ? "" : "/"}${cleanPath}`;
      }
    }
    const url = cleanPath.startsWith("http") ? cleanPath : `${API}${cleanPath}`;
    const r = await fetch(url, { method: "POST", body: form, headers });
    const text = await r.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) throw mapError(body, r.status);
    return body;
  },
};

export async function loginRequest(email: string, password: string) {
  const data = await api.post("/auth/login", { email, password });
  await storage.set("access_token", data.access_token);
  return data.user;
}

export async function registerRequest(payload: any) {
  const data = await api.post("/auth/register", payload);
  await storage.set("access_token", data.access_token);
  return data.user;
}

export async function verifyPin(pin: string) {
  const data = await api.post("/auth/pin/verify", { pin });
  await storage.set("parent_pin_token", data.pin_token);
}

export async function changePin(currentPin: string, newPin: string) {
  await api.patch("/auth/pin", { current_pin: currentPin, new_pin: newPin });
}

export async function clearPin() {
  await storage.del("parent_pin_token");
}

export async function logout() {
  await storage.del("access_token");
  await storage.del("parent_pin_token");
}

export async function deleteAccount(password: string) {
  await api.del("/auth/account", { password });
  await logout();
}

export function photoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${API}/api/photos/${path}`;
}
