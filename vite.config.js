import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'electron/main.cjs',
        vite: {
          build: {
            lib: {
              entry: 'electron/main.cjs',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron', '@nut-tree-fork/nut-js'],
              output: {
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
      {
        entry: 'electron/preload.cjs',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            lib: {
              entry: 'electron/preload.cjs',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
});
