import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {splitVendorChunkPlugin} from 'vite';
import {createHtmlPlugin} from 'vite-plugin-html';
import fs from 'fs';

const hash = fs.readFileSync('public/definitions/hash.json', 'utf8');

/*
 * GitHub Pages 는 하위 경로(.../via-he/)로 연다. 안 알려주면 빌드된 js·이미지
 * 경로가 전부 어긋나 빈 화면이 뜬다.
 *
 * ★ 빌드할 때만 준다. dev 서버에까지 걸면 localhost:5173/via-he/ 로 바뀌는데
 *   얻는 것 없이 번거롭기만 하다.
 *
 * ★ 다른 데 올릴 때는 VITE_BASE 로 덮는다. 루트에 올린다면 `VITE_BASE=/`.
 */
const BASE = process.env.VITE_BASE ?? '/via-he/';

/*
 * 새로고침을 받아 줄 404.html 을 같이 만든다.
 *
 * ★ 왜 필요한가.
 *
 *   주소가 /he, /console 처럼 갈리는데 Pages 에는 그런 파일이 없다. 그대로 두면
 *   그 화면에서 새로고침할 때마다 404 다. Pages 는 없는 경로에 404.html 을
 *   돌려주므로, index.html 을 그 이름으로 한 벌 더 두면 앱이 그대로 받아 낸다.
 *
 * ★ 워크플로가 아니라 여기서 만든다. 그래야 로컬 `bun run build` 와 CI 산출물이
 *   같아진다 — 다르면 로컬에서 재현이 안 되는 문제가 생긴다.
 */
const spaFallback = () => ({
  name: 'spa-404-fallback',
  apply: 'build' as const,
  closeBundle() {
    const index = path.join('dist', 'index.html');
    if (fs.existsSync(index)) {
      fs.copyFileSync(index, path.join('dist', '404.html'));
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig(({command}) => ({
  base: command === 'build' ? BASE : '/',
  plugins: [
    react(),
    spaFallback(),
    createHtmlPlugin({
      inject: {
        data: {
          hash,
        },
      },
    }),
    splitVendorChunkPlugin(),
  ],
  assetsInclude: ['**/*.glb'],
  envDir: '.',
  server: {open: true},
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
      assets: path.resolve(__dirname, './src/assets'),
    },
  },
  optimizeDeps: {
    include: ['@the-via/reader'],
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
      // Enable esbuild polyfill plugins
      plugins: [],
    },
  },
}));
