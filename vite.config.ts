import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

function versionJsonPlugin(): Plugin {
  return {
    name: 'version-json',
    closeBundle() {
      const version = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, '.');
      const content = JSON.stringify({ version });
      // Production only: dist/version.json is the runtime cache-bust signal.
      // Never write to public/ — that would be checked into source and defeat cache-busting.
      const distDir = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distDir)) {
        fs.writeFileSync(path.resolve(distDir, 'version.json'), content);
      }
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
    versionJsonPlugin(),
    mcpPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      // CRITICAL: Redirect all imports of generated client to production wrapper
      // This ensures detectSessionInUrl: true is used everywhere
      "@/integrations/supabase/client": path.resolve(__dirname, "./src/lib/supabaseClient.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // NOTE: manualChunks removed intentionally.
    // The previous configuration split React, Radix and a catch-all `vendor`
    // chunk, creating a circular initialization chain that surfaced in
    // production as: "Cannot read properties of undefined (reading 'forwardRef')"
    // from vendor-radix (Radix components evaluated before React finished
    // initializing). Rollup's default chunking is safe; route-level lazy
    // loading is the correct next step for entry-chunk size reduction.
  },
}));

