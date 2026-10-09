/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            // Keep our own service worker (src/service-worker.ts) and registration code;
            // the plugin only builds it and injects the precache manifest.
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'service-worker.ts',
            injectRegister: false,
            manifest: false,
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,svg,webmanifest}']
            }
        })
    ],
    // Existing Vercel variables keep working (REACT_APP_VAPID_PUBLIC_KEY, ...).
    envPrefix: ['VITE_', 'REACT_APP_'],
    server: { port: 3000 },
    build: {
        outDir: 'build',
        sourcemap: false,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                // Firebase changes rarely: a separate chunk stays cached across app releases.
                // (Splitting MUI/emotion the same way breaks module init order, so they stay in the main chunk.)
                manualChunks: (id) => (/node_modules\/(@firebase|firebase)\//.test(id) ? 'firebase' : undefined)
            }
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.test.ts']
    }
});
