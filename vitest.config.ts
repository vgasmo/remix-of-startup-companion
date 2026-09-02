import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Several suites dynamically import heavy component barrels; the 5s default
    // flakes when the whole suite runs in parallel.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/integrations/supabase/client": path.resolve(__dirname, "./src/lib/supabaseClient.ts"),
    },
  },
});
