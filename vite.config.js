import { defineConfig } from 'vite';

// `host: true` exposes the dev server on your local network so you can open the
// printed "Network" URL on a real phone. `open` is off because mobile testing is
// the priority here.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
  },
});
