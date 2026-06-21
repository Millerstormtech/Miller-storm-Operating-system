import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/router";

type User = {
  _id?: string; // MongoDB ID
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "sales" | "marketing";
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
    const storedUser = localStorage.getItem("user");
    if (storedUser && storedUser !== "undefined") {
      try {
        setUser(JSON.parse(storedUser));
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
    const user: User = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      managerId: userData.managerId
    };

    setUser(user);
    localStorage.setItem("user", JSON.stringify(user));

    if (user.role === "admin") {
      router.push("/admin/social-media-metrics");
    } else if (user.role === "manager") {
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
