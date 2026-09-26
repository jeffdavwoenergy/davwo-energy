"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import api, { clearToken, getToken, setToken } from "@/lib/api";
import type { Market, Role, User } from "@/lib/types";

interface AuthCtx {
  user: User | null;
  booting: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (input: { orgName: string; region?: string; market?: Market; name: string; email: string; password: string }) => Promise<User>;
  demoLogin: (role: Role) => Promise<User>;
  switchOrg: (orgId: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setBooting(false);
      return;
    }
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    // Load the current user once on mount. refresh() is async and only calls
    // setState after awaiting /auth/me, so this is not the synchronous
    // setState-in-effect cascade the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ token: string; user: User }>("/auth/login", {
      email,
      password,
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(
    async (input: { orgName: string; region?: string; name: string; email: string; password: string }) => {
      const { data } = await api.post<{ token: string; user: User }>("/auth/signup", input);
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const demoLogin = useCallback(async (role: Role) => {
    const { data } = await api.post<{ token: string; user: User }>(
      `/auth/demo-login?role=${role}`,
    );
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const switchOrg = useCallback(async (orgId: string) => {
    const { data } = await api.post<{ token: string; user: User }>(
      `/auth/switch-org?orgId=${orgId}`,
    );
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, booting, login, signup, demoLogin, switchOrg, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
