import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'favicon.png', 'logo-mark.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ContratoPay — Gestão Inteligente de Contratos',
        short_name: 'ContratoPay',
        description: 'Acompanhe saldo, parcelas e pagamentos do seu contrato.',
        lang: 'pt-BR',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f4f6',
        theme_color: '#5a3ff2',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          // O ícone tem fundo gradiente full-bleed, então também serve como maskable.
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell offline; navegação cai no index.html (SPA).
        navigateFallback: '/index.html',
        // Não intercepta chamadas ao Supabase (sempre rede).
        navigateFallbackDenylist: [/supabase\.co/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
