import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const storage = {
  get: (k: string) => Platform.OS === "web" ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k),
  set: (k: string, v: string) => Platform.OS === "web" ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v),
  del: (k: string) => Platform.OS === "web" ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k),
};

const API = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const BACKEND_URL = API;

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.get("access_token");
  const pinToken = await storage.get("parent_pin_token");
  const headers: any = { "Content-Type": "application/json", ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (pinToken) headers["X-Parent-Pin-Token"] = pinToken;
  const r = await fetch(`${API}/api${path}`, { ...init, headers });
  const text = await r.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) throw new Error(body?.detail || body?.message || `HTTP ${r.status}`);
  return body;
}

export const api = {
  get: <T=any>(p: string) => request<T>(p),
  post: <T=any>(p: string, body?: any) => request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T=any>(p: string, body?: any) => request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T=any>(p: string) => request<T>(p, { method: "DELETE" }),
  upload: async <T=any>(p: string, form: FormData): Promise<T> => {
    const token = await storage.get("access_token");
    const pinToken = await storage.get("parent_pin_token");
    const headers: any = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (pinToken) headers["X-Parent-Pin-Token"] = pinToken;
    const r = await fetch(`${API}/api${p}`, { method: "POST", body: form, headers });
    const text = await r.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) throw new Error(body?.detail || `HTTP ${r.status}`);
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

export async function clearPin() {
  await storage.del("parent_pin_token");
}

export async function logout() {
  await storage.del("access_token");
  await storage.del("parent_pin_token");
}

export function photoUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${API}/api/photos/${path}`;
}
