import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// The Midnight SDK ships WASM and assumes a handful of Node globals
// (Buffer, process). `vite-plugin-wasm` enables the WASM ESM integration and
// `vite-plugin-node-polyfills` shims the globals for the browser build.
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    nodePolyfills({
      // The Midnight SDK needs Buffer and a `global` alias. We deliberately do
      // NOT shim `process`: React's CJS build references process.env.NODE_ENV,
      // and injecting the shim there fails to resolve under npm workspaces
      // (react hoists to the root, the plugin does not). Vite already replaces
      // process.env.NODE_ENV at build time, and `define` below covers the rest.
      globals: { Buffer: true, global: true, process: false },
      protocolImports: true,
    }),
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  resolve: {
    alias: {
      // See src/shims/isomorphic-ws.ts — restores the named WebSocket export
      // the indexer provider expects.
      'isomorphic-ws': fileURLToPath(new URL('./src/shims/isomorphic-ws.ts', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    // The ZK prover key is ~2.7MB; don't warn on the resulting chunk sizes.
    chunkSizeWarningLimit: 4000,
  },
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
    // WASM-bearing packages must not be pre-bundled.
    exclude: ['@midnight-ntwrk/ledger-v8', '@midnight-ntwrk/onchain-runtime-v3'],
  },
  worker: { format: 'es' },
});
