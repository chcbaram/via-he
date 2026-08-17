# 이 저장소에서 일할 때

VIA 를 포크한 웹 설정 도구. WISH60 HE 를 브라우저에서 설정하고 펌웨어도 여기서 굽는다.
https://chcbaram.github.io/via-he/ 에서 돈다.

펌웨어는 별도 저장소다 — [chcbaram/wish-he](https://github.com/chcbaram/wish-he).
장치 쪽 프로토콜을 바꾸면 양쪽을 같이 고쳐야 한다 (`0xC0`~ 대역이 우리 확장,
`0xFF60` 이 VIA 채널).

## 증상만 듣고 고치지 않는다

**"까맣게 나온다", "안 뜬다" 는 원인을 안 알려준다.** 실제로 그 상태에서 짐작으로
세 번 고쳤고 세 번 다 빗나갔다. 원인은 엉뚱한 데(정의 파일 형식)에 있었다.

개발 서버에 **브라우저 오류 통로**를 뚫어 뒀다 (`vite.config.ts` 의 `browserErrorLog`).
화면이 죽으면 그 오류가 **서버를 띄운 터미널에 그대로 찍힌다.**

```
[브라우저 오류]
error: TypeError: Cannot read properties of undefined (reading '0')
    at definitionsSlice.ts:118  ->  getSelectedOptionKeys
```

장치 쪽의 `tools/dev.py` 에 해당하는 것이다. 손대기 전에 이걸 먼저 본다.

## 보드 정의는 손으로 복사하면 안 된다

가장 크게 데인 자리다.

```sh
cp <펌웨어>/keyboards/<보드>/layout-via.json  local-kbs/<보드>.json
bun scripts/add-local-kbs.ts        # 변환 + 목록 등록 + 해시 갱신
# 개발 서버 재시작 (해시를 시작할 때 한 번 읽는다)
```

`public/definitions/v3/<vpid>.json` 에 직접 넣으면 **형식이 다르다.**

```
편집용 원본    layouts: keymap, labels
앱이 읽는 것   layouts: keys, optionKeys, labels, width, height
```

그냥 복사하면 `optionKeys` 가 없어 **키보드가 붙는 순간 화면이 통째로 죽는다.**
게다가 해시가 안 바뀌어 캐시도 안 물러진다.

★ **정의는 캐시된다.** `index.html` 의 `data-hash` 가 달라져야 앱이 캐시를 버린다
  (`device-store.ts` 의 `syncStore`). 그 해시를 위 스크립트가 갱신한다.

## 메뉴 라벨은 영어로 쓴다

라벨 문자열이 **그대로 i18n 키**다 (`custom-control.tsx` 의 `t(props.label)`).
한글을 박으면 어느 언어로 보든 한글만 나온다. 번역은 `src/locales/*.json` 에 둔다.

## 프로파일

장치는 키맵·조명·HE 설정·탭홀드를 **프로파일마다 따로** 갖고 있다. 그런데 VIA 는
그 값들을 **붙을 때 한 번만** 읽는다. 그래서 프로파일을 바꾸면 다시 읽어야 한다 —
`profile-select.tsx` 의 `pick()` 에서 키맵과 메뉴 값을 둘 다 다시 읽는다.

안 하면 어느 프로파일에 가도 화면 값이 같아 보이고, 더 나쁘게는 화면에 남은 옛 값이
새 프로파일에 쓰인다.

## 다음에 할 UI 두 가지

- [ ] **릴리즈 노트를 4줄까지만 보이게 + 스크롤** — 지금 7줄이라 펌웨어 화면을 잡아먹는다.
      목록 컨테이너에 `max-height` 와 `overflow-y: auto` 를 주면 된다. 노트 본문은
      펌웨어 쪽 `tools/make_release.py --note` 로 만든 manifest.json 에 들어 있다.

- [ ] **아래 설정 패널을 창 가운데로** — 위쪽 키보드 그림은 창 중앙인데 아래 패널은
      왼쪽 사이드바 폭만큼 밀려 있어 **중심이 서로 어긋나 보인다.** 패널 컨테이너에
      `margin: 0 auto` 와 `max-width` 를 주어 키보드와 같은 중심에 놓는다.

## 깃

- **커밋은 지시할 때만 한다.** 작업이 끝났다고 자동으로 커밋하지 않고, 묻지도 않는다
- 커밋 메시지에 Claude 서명(`Co-Authored-By` 등)을 넣지 않는다
- `public/definitions/` 는 깃 무시 대상이다 (33MB). 빌드가 `dist` 로 복사해 배포한다

## 문서와 주석

- **구현 자체를 설명한다.** 다른 제품·보드를 견주어 쓰지 않고, 제품·회사 이름도 쓰지 않는다
- 오류 표기는 `[E_]` 로 한다 (`[NG]` 아님)
- 상류(VIA)와 다르게 고친 자리에는 **`★ (상류 대비 수정)`** 과 그 이유를 남긴다.
  다음에 상류를 따라갈 때 무엇을 지켜야 하는지가 거기서 갈린다

## 띄우기

```sh
bunx vite            # http://localhost:5173/  — dev 는 base 가 '/'
bun run build        # 배포본은 base 가 '/via-he/'
```

★ `bun run dev` 는 `--force` 라 의존성 캐시를 매번 버린다. 그냥 `bunx vite` 를 쓴다.
