import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles: ("admin" | "manager" | "sales" | "marketing")[];
};

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    } else if (!isLoading && user && !allowedRoles.includes(user.role)) {
      if (user.role === "admin") {
        router.push("/admin/dashboard");
      } else if (user.role === "manager") {
        router.push("/manager/dashboard");
      } else if (user.role === "sales") {
        router.push("/sales/dashboard");
      } else if (user.role === "marketing") {
        router.push("/marketing/dashboard");
      }
    }
  }, [user, isLoading, router, allowedRoles]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
