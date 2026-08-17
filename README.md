# WISH HE — 키보드 설정 웹 도구

### 👉 https://chcbaram.github.io/via-he/

브라우저에서 바로 연다. 설치할 것이 없다.

---

## 무엇인가

**WISH60 HE** 홀이펙트 키보드를 브라우저에서 설정하는 도구다. 케이블만 꽂으면
크롬이 WebHID 로 키보드에 직접 붙는다 — 드라이버도, 설치 프로그램도 필요 없다.

[VIA](https://github.com/the-via/app) 포크다. 키맵·레이어·매크로 같은 VIA 기능은
그대로 두고, 홀이펙트 키보드에만 있는 것들을 더했다.

## 할 수 있는 것

| | |
|---|---|
| **입력 지점** | 키가 눌렸다고 볼 깊이를 0.01mm 단위로. 키마다 따로 |
| **래피드 트리거** | 되돌린 거리로 떼는 판정. 누름·해제 거리를 따로 준다 |
| **데드존** | 위아래 무시 구간 |
| **스위치** | 종류를 고르면 그 스위치 곡선으로 거리를 잰다. 목록에 없으면 **커스텀 슬롯 4개**에 데이터시트 두 점(자속)을 넣어 만든다 |
| **보정** | 키를 끝까지 눌러 전 행정을 실측한다 |
| **프로파일** | 설정 4벌. 키맵·조명까지 통째로 갈아 끼운다 |
| **키맵 · 매크로** | VIA 그대로 |
| **조명** | RGB 매트릭스 + 깊이에 반응하는 HE 전용 효과 |
| **펌웨어** | 목록에서 골라 바로 굽는다. 파일로도 된다 |

## 필요한 것

**크롬 계열 브라우저.** WebHID 를 쓰기 때문이다 — 크롬·엣지·오페라·웨일에서 되고
**사파리와 파이어폭스에서는 안 된다.**

처음 한 번은 브라우저가 장치에 연결할지 묻는다. 허용하면 그 뒤로는 기억한다.

## 굽다 만 보드도 되살린다

펌웨어를 굽다가 끊겨도 벽돌이 되지 않는다. 부트로더는 자기 자신을 못 덮어쓰고,
앱은 부팅할 때 자기 CRC 를 검사해 어긋나면 스스로 업데이트 모드로 되돌아간다.

그 상태로 이 페이지를 열면 **펌웨어 화면이 바로 뜬다.** 이미지를 골라 다시 구우면 된다.

---

## GitHub Pages 로 올리기

이 저장소는 아직 Pages 가 안 켜져 있다. 붙이려면 넷이 필요하다.

### 1. `vite.config.ts` 에 `base` 를 준다

프로젝트 페이지는 `.../via-he/` 처럼 **하위 경로**로 열린다. 그걸 안 알려주면 빌드된
자바스크립트·이미지 경로가 전부 어긋나 빈 화면이 뜬다.

```ts
export default defineConfig({
  base: '/via-he/',
  ...
});
```

### 2. 새로고침을 받아 줄 `404.html`

주소가 `/he`, `/console` 처럼 갈리는데 Pages 에는 그런 파일이 없어 새로고침하면
404 가 난다. 빌드 뒤 `index.html` 을 `404.html` 로 복사해 두면 그대로 앱이 받는다.

### 3. 워크플로 (`.github/workflows/pages.yml`)

★ **`public/definitions` 는 깃에 없다.** 33MB 라 `.gitignore` 대상이고, 업스트림
정의 2000여 개를 빌드 때 만들어야 한다. **`bun run defs` 를 먼저 안 돌리면 보드
인식이 안 되는 앱이 올라간다.**

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run defs          # ← 정의를 만든다. 빼면 안 된다
      - run: bun run build
      - run: cp dist/index.html dist/404.html
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> 산출물 폴더 이름은 `vite.config.ts` 의 `build.outDir` 를 따른다. 기본은 `dist` 다.

### 4. 저장소 설정에서 켠다

`Settings` → `Pages` → **Source 를 `GitHub Actions`** 로 바꾼다
(`Deploy from a branch` 가 아니다).

그다음 `main` 에 푸시하면 몇 분 뒤 맨 위 주소로 열린다.

### 왜 Pages 인가

WebHID 는 **HTTPS 나 localhost 에서만** 동작한다. Pages 는 HTTPS 라 그대로 된다.
정적 파일만 올리면 되어 서버가 필요 없고, 펌웨어 이미지도 `public/firmware/` 에
같이 실려 나간다.

---

## 개발

빌드·정의 끼워넣기·구조는 [README-he.md](README-he.md) 에 있다.

## 펌웨어

키보드 펌웨어는 별도 저장소다. 이 앱이 굽는 이미지는 거기서 `make_release.py` 로
만들어 `public/firmware/wish60-he/` 에 바로 쓴다.
