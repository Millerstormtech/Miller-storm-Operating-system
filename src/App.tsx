import { FormEvent, useMemo, useState, ChangeEvent, useEffect } from "react";
import Image from "next/image";
import { AdminPortal } from "./portals/AdminPortal";
import { ManagerPortal } from "./portals/ManagerPortal";
import { SalesPortal } from "./portals/SalesPortal";
import { MarketingPortal } from "./portals/MarketingPortal";
import { AuthenticatedUser, Course, UserProfile } from "./types";
import logoImage from "../ref. images/MillerStorm-Logo_page-0001.jpg.jpeg";

type LoginState = {
  email: string;
  password: string;
};

export function App() {
  const [loginState, setLoginState] = useState<LoginState>({
    email: "",
    password: ""
  });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null
  );
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadData() {
      setIsLoading(true);
      setLoginError("");
      try {
        const [usersRes, coursesRes] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/courses")
        ]);
        if (!usersRes.ok || !coursesRes.ok) {
          setLoginError("Backend connection failed.");
          setIsLoading(false);
          return;
        }
        const usersData = await usersRes.json();
        const coursesData = await coursesRes.json();
        if (!active) {
          return;
        }
        setUsers(usersData);
        setCourses(coursesData);
      } catch {
        if (active) {
          setLoginError("Backend connection failed.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  const currentProfile = useMemo(() => {
    if (!currentUser) {
      return null;
    }
    return users.find((u) => u.id === currentUser.id) ?? null;
  }, [currentUser, users]);

  useEffect(() => {
    if (currentProfile?.suspended) {
      handleLogout();
    }
  }, [currentProfile?.suspended]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginState.email,
          password: loginState.password
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setLoginError(payload?.error || "Unable to sign in.");
        return;
      }
      const userForRole = await response.json();
      setCurrentUser({
        id: userForRole.id,
        name: userForRole.name,
        role: userForRole.role
      });
      setUsers((prev) => {
        const existing = prev.find((u) => u.id === userForRole.id);
        if (existing) {
          return prev.map((u) => (u.id === userForRole.id ? userForRole : u));
        }
        return [...prev, userForRole];
      });
    } catch {
      setLoginError("Unable to sign in.");
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    setLoginState({ email: "", password: "" });
    setLoginError("");
  }

  async function updateUsers(next: UserProfile[]) {
    setUsers(next);
    try {
      const response = await fetch("/api/users/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      if (response.ok) {
        const payload = await response.json();
        setUsers(payload);
      }
    } catch {
      setLoginError("Unable to save users.");
    }
  }

  async function updateCourses(next: Course[]) {
    setCourses(next);
    try {
      const response = await fetch("/api/courses/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next)
      });
      if (response.ok) {
        const payload = await response.json();
        setCourses(payload);
      }
    } catch {
      setLoginError("Unable to save courses.");
    }
  }

  function handleProfileChange(profile: UserProfile) {
    updateUsers(
      users.map((u: UserProfile) => (u.id === profile.id ? profile : u))
    );
  }

  if (!currentUser) {
    return (
      <div className="login-root">
        <div className="login-card">
          <div className="login-logo">
            <Image
              src={logoImage}
              alt="Miller Storm logo"
              width={180}
              height={96}
            />
          </div>
          <div className="login-title">
            The Miller Storm Operating System
          </div>
          <div className="login-subtitle">
            Sign in
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            {loginError && (
              <div className="form-error">{loginError}</div>
            )}
            <label className="field">
              <span className="field-label">Work Email</span>
              <input
                className="field-input"
                type="email"
                value={loginState.email}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setLoginState({ ...loginState, email: e.target.value })
                }
                placeholder="you@company.com"
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <div className="password-input-wrap">
                <input
                  className="field-input password-input"
                  type={showLoginPassword ? "text" : "password"}
                  value={loginState.password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setLoginState({ ...loginState, password: e.target.value })
                  }
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM4 12l-2-2 10-6 2 2-10 6z"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 5c7 0 10 7 10 7s-3 7-10 7S2 12 2 12s3-7 10-7zm0 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              <div className="login-links" style={{marginTop: '4px', justifyContent: 'flex-start'}}>
                <a href="#" className="login-link">Forgot Password</a>
              </div>
            </label>
            <button className="btn-primary" type="submit" disabled={isLoading}>
              Sign In
            </button>
            <div className="login-links" style={{marginTop: '12px'}}>
              <a href="#" className="login-link">Register</a>
            </div>
          </form>
        </div>
        <div className="login-footer">
          © 2026-2027 Miller Storm. All Rights Reserved.
        </div>
      </div>
    );
  }

  if (currentUser.role === "admin") {
    return (
      <AdminPortal
        currentUser={currentUser}
        onLogout={handleLogout}
        users={users}
        onUsersChange={updateUsers}
        courses={courses}
        onCoursesChange={updateCourses}
      />
    );
  }

  if (currentUser.role === "manager") {
    const teamMembers = users.filter((u) => u.managerId === currentUser.id);
    return (
      <ManagerPortal
        currentUser={currentUser}
        teamMembers={teamMembers}
        courses={courses}
        onTeamMembersChange={(nextTeamMembers: UserProfile[]) => {
          const nextUsers = users.map((user: UserProfile) => {
            const updated = nextTeamMembers.find(
              (member: UserProfile) => member.id === user.id
            );
            return updated ?? user;
          });
          updateUsers(nextUsers);
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (currentUser.role === "sales" && currentProfile) {
    return (
      <SalesPortal
        currentUser={currentUser}
        profile={currentProfile}
        onProfileChange={handleProfileChange}
         courses={courses}
        onLogout={handleLogout}
      />
    );
  }

  if (currentUser.role === "marketing") {
    return (
      <MarketingPortal currentUser={currentUser} onLogout={handleLogout} />
    );
  }

  return null;
}
