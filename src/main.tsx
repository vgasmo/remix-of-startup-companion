import { createRoot } from "react-dom/client";
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

// 🛡️ PWA service-worker guard
// Lovable preview runs the app inside an iframe. A registered SW would
// cache stale builds and break preview navigation. We unregister any SW
// when running inside an iframe or on a Lovable preview host.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin block → assume iframe
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  }).catch(() => { /* noop */ });
}

createRoot(document.getElementById("root")!).render(<App />);
