import type { AppProps } from "next/app";
import { AuthProvider } from "../src/contexts/AuthContext";
import { AppDialogs } from "../src/components/AppDialogs";
import "../src/styles.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
      <AppDialogs />
    </AuthProvider>
  );
}
