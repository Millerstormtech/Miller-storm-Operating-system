import { Html, Head, Main, NextScript } from "next/document";

// Custom document: adds the PWA manifest + install/meta tags to every page.
// This is additive — it changes nothing about how existing pages render.
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* PWA manifest (installability, icons, name, theme) */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#CB0002" />
        <meta name="application-name" content="Miller Storm" />

        {/* iOS: enables "Add to Home Screen" as a standalone app + icon.
            (iOS 16.4+ also needs this standalone install for web push.) */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Miller Storm" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        {/* Android/Chrome uses the manifest icons; this is a sensible favicon. */}
        <link rel="icon" type="image/png" href="/icons/icon-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
