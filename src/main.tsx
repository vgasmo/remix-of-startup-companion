import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

// Validate environment variables at startup (fail-fast in dev)
import { validateEnv } from "./lib/env";
validateEnv();

// 🛰️ Global error capture → client_error_logs sink (Tier-0 observability).
// logError is fire-and-forget; these handlers never block the app.
import { logError } from "./lib/logError";
import { installConsoleBuffer } from "./lib/consoleBuffer";

installConsoleBuffer();

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const err = event.error instanceof Error
      ? event.error
      : new Error(event.message || "window.onerror");
    logError(err, { component: "window.onerror", severity: "high" });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const err = reason instanceof Error
      ? reason
      : new Error(typeof reason === "string" ? reason : "unhandledrejection");
    logError(err, { component: "unhandledrejection", severity: "high" });
  });
}

// 🛡️ Legacy PWA cache guard
// The app must never fall back to an older deployed bundle. Earlier builds
// registered a Workbox service worker, so purge any remaining registrations
// and runtime caches on every host, including the custom domain.
if (typeof window !== "undefined") {
  navigator.serviceWorker?.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
    .catch(() => { /* noop */ });

  window.caches?.keys()
    .then((names) => Promise.all(names.map((name) => caches.delete(name))))
    .catch(() => { /* noop */ });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
);
