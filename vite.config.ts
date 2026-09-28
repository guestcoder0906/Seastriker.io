import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'import.meta.env.SUPABASE_SECRET_KEY': JSON.stringify(
        process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndXJlc2dzd2lmc2phbWd5cGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Mjc1MzksImV4cCI6MjEwNjEwMzUzOX0.B-pFItn9R0R3SIGvACysblN1-Wy6OhrhX27xspAsvtA'
      ),
      'import.meta.env.VITE_SUPABASE_SECRET_KEY': JSON.stringify(
        process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndXJlc2dzd2lmc2phbWd5cGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Mjc1MzksImV4cCI6MjEwNjEwMzUzOX0.B-pFItn9R0R3SIGvACysblN1-Wy6OhrhX27xspAsvtA'
      ),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://hguresgswifsjamgypcg.supabase.co'
      ),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
