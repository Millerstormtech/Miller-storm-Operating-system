import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { startActivityBeacon } from "../lib/activity/tracker";

// Mounted once (in _app) inside the auth provider. Starts the usage heartbeat
// as soon as someone is signed in. Renders nothing.
export function ActivityBeacon() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) startActivityBeacon();
  }, [user]);
  return null;
}
