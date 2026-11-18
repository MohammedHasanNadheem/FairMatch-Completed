import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  // One root .env file configures both the React app and Node API.
  envDir: '../../',
  plugins: [react()],
});
