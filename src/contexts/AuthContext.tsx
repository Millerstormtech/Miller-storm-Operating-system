import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/router";
import { setToken, clearToken, installAuthFetch } from "../lib/authToken";
import { enableWebPush } from "../lib/webPush";

// Install the global Authorization-header fetch wrapper as early as possible,
// before any component fires off API requests.
installAuthFetch();

type User = {
  _id?: string; // MongoDB ID
  id: string;
  name: string;
  email: string;
  role: "admin" | "sales-team-lead" | "sales" | "marketing" | "c-level" | "branch-manager";
  managerId?: string;
};

type AuthContextType = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    installAuthFetch();
    const storedUser = localStorage.getItem("user");
    if (storedUser && storedUser !== "undefined") {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        // Re-register the web-push token on return visits (no prompt if the
        // user already granted permission).
        if (parsed?.id) enableWebPush(parsed.id);
      } catch (error) {
        localStorage.removeItem("user");
      }
    }
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const userData = await response.json();

    // Store the server-issued token so every subsequent API request can send
    // it as an Authorization: Bearer header (see installAuthFetch).
    if (userData.token) {
      setToken(userData.token);
    }

    const user: User = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      managerId: userData.managerId
    };

    setUser(user);
    localStorage.setItem("user", JSON.stringify(user));

    // Enable web push now — login is a user gesture, which iOS/Safari require
    // before showing the notification-permission prompt.
    enableWebPush(user.id);

    if (user.role === "admin") {
      router.push("/admin/user-management");
    } else if (user.role === "c-level") {
      router.push("/c-level/dashboard");
    } else if (user.role === "branch-manager") {
      router.push("/branch-manager/dashboard");
    } else if (user.role === "sales-team-lead") {
      router.push("/manager/dashboard");
    } else if (user.role === "sales") {
      router.push("/sales/dashboard");
    } else if (user.role === "marketing") {
      router.push("/marketing/dashboard");
    }
  }

  function logout() {
    setUser(null);
    localStorage.removeItem("user");
    clearToken();
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
