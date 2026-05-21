import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "offline.html"],
      manifest: {
        name: "ChristLife World",
        short_name: "ChristLife",
        description: "Build your church. Grow your congregation. Change the world.",
        start_url: "/",
        display: "fullscreen",
        orientation: "landscape",
        background_color: "#0f0520",
        theme_color: "#7C3AED",
        categories: ["games", "education", "lifestyle"],
        icons: [
          { src: "/icons/icon-72.png",   sizes: "72x72",   type: "image/png" },
          { src: "/icons/icon-96.png",   sizes: "96x96",   type: "image/png" },
          { src: "/icons/icon-128.png",  sizes: "128x128", type: "image/png" },
          { src: "/icons/icon-144.png",  sizes: "144x144", type: "image/png" },
          { src: "/icons/icon-152.png",  sizes: "152x152", type: "image/png" },
          { src: "/icons/icon-192.png",  sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-384.png",  sizes: "384x384", type: "image/png" },
          { src: "/icons/icon-512.png",  sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-icon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "apple touch icon"
          }
        ],
        screenshots: [
          {
            src: "/screenshots/screenshot-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
            label: "ChristLife World — Desktop"
          },
          {
            src: "/screenshots/screenshot-mobile.png",
            sizes: "390x844",
            type: "image/png",
            form_factor: "narrow",
            label: "ChristLife World — Mobile"
          }
        ],
        shortcuts: [
          {
            name: "Enter Church",
            url: "/",
            icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }]
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "firebase-cache",
              networkTimeoutSeconds: 5
            }
          }
        ],
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/]
      },
      devOptions: { enabled: false }
    })
  ]
});
