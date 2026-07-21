import type { AppProps } from "next/app";
import { useEffect } from "react";
import { AuthProvider } from "../src/contexts/AuthContext";
import { AppDialogs } from "../src/components/AppDialogs";
import "../src/styles.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  // Register the PWA service worker (installability + offline + push). This is
  // purely additive: online behaviour is unchanged (the SW is network-first),
  // and browsers that don't support it simply ignore it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW registration is best-effort; never block the app on it. */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return (
    <AuthProvider>
      <Component {...pageProps} />
      <AppDialogs />
    </AuthProvider>
  );
}
