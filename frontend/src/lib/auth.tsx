import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage, api, logout as apiLogout, loginRequest, registerRequest } from "./api";

type User = {
  id: string; email: string; name: string; role: "parent" | "child";
  family_id: string; avatar?: string; points: number; streak: number;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (p: any) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const tok = await storage.get("access_token");
      if (!tok) { setUser(null); return; }
      const me = await api.get("/auth/me");
      setUser(me);
    } catch { setUser(null); await storage.del("access_token"); }
  }, []);

  useEffect(() => { (async () => { await refresh(); setLoading(false); })(); }, [refresh]);

  return (
    <AuthCtx.Provider value={{
      user, loading, setUser,
      login: async (e, p) => { const u = await loginRequest(e, p); setUser(u); return u; },
      register: async (p) => {
        const data = await registerRequest(p);
        setUser(data.user);
        return data;
      },
      logout: async () => { await apiLogout(); setUser(null); },
      refresh,
    }}>{children}</AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthCtx");
  return c;
}
