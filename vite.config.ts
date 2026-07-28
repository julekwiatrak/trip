import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "app-icon.svg"],
      manifest: {
        id: "/trip/",
        name: "Trip Itinerary",
        short_name: "Trip",
        description: "A live shared itinerary for the trip.",
        start_url: "/trip/",
        scope: "/trip/",
        display: "standalone",
        background_color: "#f8f7f3",
        theme_color: "#f8f7f3",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "/trip/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: "/trip/",
});
