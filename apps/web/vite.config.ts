import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const server = process.env.UNO_SERVER ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: server, changeOrigin: false },
      "/healthz": { target: server },
      "/socket.io": { target: server, ws: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-dom/client"],
          motion: ["motion", "motion/react"],
          net: ["socket.io-client"],
        },
      },
    },
  },
});
