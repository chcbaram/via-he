# via-he — VIA 웹앱 포크 (홀이펙트 확장)

[the-via/app](https://github.com/the-via/app) 포크. `wish60-he` 펌웨어의 HE 기능을
얹는다. 업스트림 기능(키맵·레이어·매크로)은 그대로 두고 더하기만 한다.

## 준비

```sh
brew install oven-sh/bun/bun
bun install
bun run defs        # 정의 빌드 + 우리 보드 끼워넣기
bun run dev         # http://localhost:5173
```

`bun run defs` 는 두 단계다.

```
build:kbs    업스트림 정의 2000여 개를 public/definitions/ 로 컴파일
build:local  local-kbs/*.json 을 같은 형식으로 컴파일해 끼워 넣는다
```

> 업스트림 스크립트는 `node` 와 `via-keyboards` CLI 를 부르는데, 그 패키지의
> `bin/cli.js` 가 빌드 산출물(`cjs/index.cjs`)을 요구해 그대로는 돌지 않는다.
> 그래서 `scripts/build-all.ts` 를 bun 으로 직접 부른다.

## 우리 보드 정의

`local-kbs/` 에 두면 번들에 들어가 **Design 탭 없이 꽂자마자 인식**된다.

```
local-kbs/wish60-he-7u.json          <- 펌웨어 저장소에서 복사해 온다
```

원본은 펌웨어 쪽에서 생성된다 — 손으로 고치지 않는다.

```sh
# wish60-he 저장소에서
python3 tools/gen_keymap.py
cp keyboards/wish60-he-7u/layout-via.json <여기>/local-kbs/wish60-he-7u.json
```

## HE 탭

상단 메뉴의 **Hall Effect** 탭이다. 홀이펙트 보드가 연결됐을 때만 보인다 —
목록은 `local-kbs/` 에서 빌드 때 뽑아 `src/utils/he-boards.ts` 로 생성한다.

하위 메뉴로 나눠 두었다. 앞으로 늘어날 것들이 있어서 한 화면에 쌓지 않았다.

| 메뉴 | 상태 |
|---|---|
| LIVE TRACKING | 동작 — 키마다 깊이(mm)와 원시값, 눌림 표시 |
| ACTUATION | 동작 — 입력지점 · 해제지점 (전 키 공통) |
| SWITCH | 동작 — 스위치 종류 |
| RAPID TRIGGER | 펌웨어 로직 뒤 |
| DEAD ZONE | 펌웨어 로직 뒤 |
| CALIBRATION | CLI 의 `keys cal` 을 옮겨온다 |

### 왜 여기 모았나

VIA 커스텀 메뉴(정의 JSON 의 `menus`)로는 **전역 값만** 다룰 수 있다. `[채널, 값ID]`
두 바이트뿐이라 키 인덱스를 넣을 자리가 없고, 실시간 시각화 위젯도 없다.

처음에는 포크를 최소로 하려고 기본 입력지점만 커스텀 메뉴에 뒀는데, 그러면 사용자가
두 군데를 봐야 한다. **HE 관련은 전부 이 탭에** 모으고 커스텀 메뉴에는 HE 가 아닌
것(Hold OKP, NKRO)만 남겼다.

## HE 확장 (진행 중)

펌웨어의 raw HID 채널(usage page `0xFF60`)에 VIA 표준 명령과 우리 확장이 같이 온다.
확장은 VIA 가 쓰지 않는 `0xC0` 대에 있다.

| 명령 | 내용 |
|---|---|
| `0xC0` | 보드 정보 |
| `0xC1` | 리셋 |
| `0xC2` | 물리 배치 읽기 — **JSON 없이 장치만 보고 그린다** |
| `0xC3` | 라이브 트래킹 on/off |
| `0xC4` | (장치 → 호스트) 트래킹 프레임 |

★ 응답은 보낸 명령과 인자를 그대로 되돌려준다.

VIA 클라이언트가 `[명령, ...인자]` 로 시작하는지 검사하고 아니면 버린다.
처음에는 `[1]` 에 상태 바이트를 넣었다가 "Receiving incorrect response for
command" 로 걸렸다. 맞춰두면 VIA 의 명령 큐·타임아웃·에러 로그를 그대로 쓴다 —
설정 채널은 VIA 명령과 공유하므로 큐를 갈라놓으면 응답 짝이 어긋난다.

스트리밍(`0xFF61`)은 요청-응답이 아니라 맞출 이유가 없고, WebHID 로 직접 연다.

- [x] 라이브 트래킹 — 키마다 눌린 깊이(mm)와 원시값
- [x] 입력지점 / 해제지점 / 스위치
- [ ] 키별 입력지점
- [ ] 래피드 트리거 / 데드존 (펌웨어 로직 뒤)
- [ ] 보정 마법사

## GitHub Pages

정적 SPA 라 Pages 로 배포된다. WebHID 는 보안 컨텍스트만 요구하고 Pages 는 HTTPS 다.

- 크로미움 계열에서만 동작한다 (Chrome·Edge). Firefox·Safari 는 WebHID 가 없다
- Pages 는 `/<저장소>/` 하위라 vite `base` 를 맞춰야 한다
- SPA 라우팅은 `404.html` 로 우회한다
