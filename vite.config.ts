import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

function versionJsonPlugin(): Plugin {
  return {
    name: 'version-json',
    closeBundle() {
      const version = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, '.');
      const content = JSON.stringify({ version });
      // Write to dist (production) and public (source, so next dev/build starts fresh)
      fs.writeFileSync(path.resolve(__dirname, 'dist/version.json'), content);
      fs.writeFileSync(path.resolve(__dirname, 'public/version.json'), content);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      // 🛡️ Disable SW in dev — prevents stale cache while iterating in preview
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Startup Leiria Portal',
        short_name: 'SL Portal',
        description: 'Startup mentorship and workspace management portal',
        theme_color: '#c82333',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          {
            src: '/favicon.ico',
            sizes: '48x48',
            type: 'image/x-icon'
          },
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // CRITICAL: Do NOT precache JS/CSS/HTML — Vite already content-hashes assets.
        // Precaching causes stale bundles that persist across deploys.
        // Only precache icons needed for PWA install prompt.
        globPatterns: ['**/*.{ico,png}'],
        globIgnores: ['**/version.json'],
        // No navigateFallback — let the network serve fresh index.html every time
        navigateFallback: null,
        // Safety net: never intercept Lovable internal/oauth routes if a fallback
        // is later re-enabled.
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        // Skip waiting for faster updates
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Google Fonts — long-lived, safe to cache
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            // App JS/CSS bundles — network first, fall back to cache for offline
            urlPattern: /\/assets\/.*\.(js|css)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-assets',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              networkTimeoutSeconds: 5,
            }
          }
        ]
      }
    }),
    versionJsonPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      // CRITICAL: Redirect all imports of generated client to production wrapper
      // This ensures detectSessionInUrl: true is used everywhere
      "@/integrations/supabase/client": path.resolve(__dirname, "./src/lib/supabaseClient.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
