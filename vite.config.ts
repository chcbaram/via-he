import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {splitVendorChunkPlugin} from 'vite';
import {createHtmlPlugin} from 'vite-plugin-html';
import fs from 'fs';

/*
 * 정의 캐시를 무르는 해시 — index.html 에 박아 두면 앱이 부팅 때 보고, 달라졌으면
 * 캐시한 정의를 통째로 버린다 (device-store.ts 의 syncStore).
 *
 * ★ 이 파일은 scripts/add-local-kbs.ts 가 갱신한다. 정의를 고쳤으면 그 스크립트를
 *   돌려야 한다 — public/definitions/v3/ 에 손으로 복사하면 안 된다. 편집용 원본과
 *   앱이 읽는 형식이 다르고(keymap vs keys+optionKeys), 해시도 안 바뀐다.
 */
const hash = fs.readFileSync('public/definitions/hash.json', 'utf8');

/*
 * 브라우저 오류를 개발 서버 로그로 보낸다. (개발 전용)
 *
 * ★ 왜 만들었나.
 *
 *   장치 쪽은 tools/dev.py 로 직접 재니 원인이 한 번에 갈린다. 그런데 웹 쪽은
 *   "까맣게 나온다" 같은 증상만 오가서, 콘솔을 열어 보기 전에는 짐작밖에 할 수가
 *   없었다. 실제로 그러다 여러 번 헛짚었다.
 *
 *   이제 화면이 죽으면 그 오류가 개발 서버를 띄운 터미널에 그대로 찍힌다.
 */
const browserErrorLog = () => ({
  name: 'browser-error-log',
  apply: 'serve' as const,
  configureServer(server: any) {
    server.middlewares.use('/__err', (req: any, res: any, next: any) => {
      if (req.method !== 'POST') return next();
      let body = '';
      req.on('data', (c: any) => (body += c));
      req.on('end', () => {
        console.error('\n[브라우저 오류]\n' + body + '\n');
        res.statusCode = 204;
        res.end();
      });
    });
  },
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        injectTo: 'head' as const,
        children: `
          (function () {
            var send = function (what, e) {
              try {
                fetch('/__err', {
                  method: 'POST',
                  body: what + ': ' + ((e && (e.stack || e.message)) || e),
                });
              } catch (_) {}
            };
            window.addEventListener('error', function (ev) {
              send('error', ev.error || ev.message);
            });
            window.addEventListener('unhandledrejection', function (ev) {
              send('unhandledrejection', ev.reason);
            });
          })();
        `,
      },
    ];
  },
});

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
    browserErrorLog(),
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
