/*
 * heSlice.ts — HE 탭의 키 선택
 *
 * ★ 왜 스토어에 두나.
 *
 *   키보드 그림은 공유 캔버스(canvas-router)가 그리고 설정판은 HE 탭이 그린다.
 *   서로 다른 트리에 있어서 지역 상태로는 주고받을 수 없다. 스토어에 두면 양쪽이
 *   같은 것을 본다.
 *
 * 키는 **매트릭스 인덱스**(row * MATRIX_COLS + col)로 센다. 펌웨어의 키별 설정 명령이
 * 그 번호를 쓰므로 중간에 변환할 자리를 만들지 않는다.
 */
import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import type {RootState} from '.';

type HeState = {
  selectedKeys: number[];

  /*
   * 키보드 그림에 무엇을 칠할지 — **지금 화면이 정한다.**
   *
   * ★ 화면마다 키보드에 보여줄 것이 다르다.
   *
   *   설정 화면은 "고른 키" 를, 보정 화면은 "아직 안 된 키" 를, 보정 도는 중에는
   *   "끝난 키" 를 보여야 한다. 앞으로 키별 값이나 디버그 정보도 붙는다.
   *
   *   그래서 그림은 이 하나만 본다. **화면에 들어갈 때 자기 것을 넣는 것이
   *   그 화면의 책임이다.** 안 넣으면 앞 화면의 표시가 그대로 남는다 — 실제로
   *   보정에서 칠한 것이 펌웨어 화면까지 따라갔다.
   *
   *   null 은 "표시할 것이 없으니 선택을 보여라" 는 뜻이다. 빈 배열과 다르다 —
   *   빈 배열은 "칠할 것이 없다" 이다.
   */
  overlayKeys: number[] | null;

  /*
   * 키캡에 각인 대신 찍을 글자 — **매트릭스 인덱스**로 넣는다.
   *
   * 칠하기(overlayKeys)와 같은 규칙이다. 화면에 들어갈 때 자기 것을 넣고, 보여줄
   * 것이 없으면 null 로 되돌린다. 다만 이쪽은 값이라 통로가 따로다 — 칠하기는
   * 두 값이고 스트로크·입력지점은 연속이라 색으로는 못 보낸다.
   *
   * 값이 없는 키는 빈칸으로 둔다 (undefined). 0 을 찍으면 "0mm 로 보정됨" 으로
   * 읽힌다.
   */
  overlayText: Record<number, string> | null;
  hoverKey: number | null;

  /*
   * 키캡 아래 막대 (0~1) — **지금 상태**다. 매트릭스 인덱스로 넣는다.
   *
   * 글자와 통로를 따로 둔다. 글자는 설정값이라 가끔 바뀌지만 막대는 누르는 동안
   * 계속 움직인다 — 한 통로에 섞으면 막대가 움직일 때마다 글자까지 다시 그린다.
   */
  overlayBars: Record<number, number> | null;

  /* 지금 입력으로 잡힌 키 (매트릭스 인덱스). 막대와 다른 것이다 */
  overlayPressed: number[] | null;

  /*
   * 키캡 **아래**(윗면 밖)에 찍을 실시간 값.
   *
   * 설정값(overlayText)과 자리가 다르다. 설정값은 윗면 우하단에 있고 가끔 바뀌지만,
   * 이쪽은 누르는 동안 계속 바뀐다 — 같은 자리에 겹치면 둘 다 안 읽힌다.
   */
  overlayLive: Record<number, string> | null;
  overlayBadge: Record<number, number> | null;

  /*
   * 지금 프로파일. **화면 밖에서도 본다.**
   *
   * 프로파일은 보드 전체의 상태라 상단 막대에 늘 떠 있다. HE 화면이 자기 상태로
   * 들고 있으면 상단에서 바꿨을 때 화면이 모른다 — 옛 프로파일의 숫자를 새 것인
   * 척 보여주게 된다.
   */
  profile: {active: number; count: number} | null;

  /*
   * 프로파일을 갈아 끼우는 중인가.
   *
   * 전환은 키맵을 다시 읽는 일이라 200ms 쯤 걸린다. 그동안 키맵 화면은 "다 읽지
   * 못했다" 로 보고 로딩 화면으로 통째로 갈아탄다 — 캐릭터가 번쩍 나타났다 사라져
   * 눈이 아프다.
   *
   * 바뀌는 중이라고 알려 두면, 화면을 그대로 두고 살짝 어둡게만 해서 "지금 뭔가
   * 하고 있다" 를 보인다.
   */
  switching: boolean;
};

/*
 * 같은 내용이면 참조를 그대로 둔다.
 *
 * ★ 중복 제거는 **여기서** 해야 한다. 보내는 쪽에서 하면 안 된다.
 *
 *   키캡 하나가 캔버스 하나라, 새 객체가 오면 63개를 통째로 다시 그린다. 그래서
 *   보내는 쪽에 "직전에 보낸 것과 같으면 건너뛴다" 는 서명 비교를 뒀었는데, 이
 *   값을 쓰는 자리가 **넷**이었다 — 설정 화면, 교정 화면의 스트로크, 교정 중
 *   진행 표시, 그리고 갈래를 옮길 때의 지우기.
 *
 *   그중 하나만 서명을 들고 있으니 나머지 셋이 바꾸면 그 서명이 낡는다. 실제로
 *   교정 탭에 갔다가 입력지점으로 돌아오면 값이 안 나왔다 — 교정이 null 로 지운
 *   것을 설정 화면의 서명은 모르니, 같은 내용이라 보고 안 보낸 것이다.
 *
 *   상태를 들고 있는 쪽이 비교해야 빠뜨릴 수가 없다. 안 바꾸면 immer 가 원래
 *   객체를 그대로 돌려주므로 선택자도 memo 도 그대로 유지된다.
 */
function sameMap<T>(
  a: Record<number, T> | null,
  b: Record<number, T> | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;

  const ka = Object.keys(a);
  const kb = Object.keys(b);

  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

const initialState: HeState = {
  selectedKeys: [],
  overlayKeys: null,
  overlayText: null,
  hoverKey: null,
  overlayBars: null,
  overlayPressed: null,
  overlayLive: null,
  overlayBadge: null,
  profile: null,
  switching: false,
};

const heSlice = createSlice({
  name: 'he',
  initialState,
  reducers: {
    toggleKey: (state, action: PayloadAction<number>) => {
      const i = state.selectedKeys.indexOf(action.payload);
      if (i >= 0) state.selectedKeys.splice(i, 1);
      else state.selectedKeys.push(action.payload);
    },
    /* 끌어서 고를 때 — 지나간 키는 켜기만 한다. 토글하면 왕복할 때 꺼져 버린다. */
    addKey: (state, action: PayloadAction<number>) => {
      if (!state.selectedKeys.includes(action.payload)) {
        state.selectedKeys.push(action.payload);
      }
    },
    setKeys: (state, action: PayloadAction<number[]>) => {
      state.selectedKeys = action.payload;
    },
    /*
     * 마우스가 가리킨 키. 그림과 설정 화면이 따로 있어 Redux 를 거친다.
     *
     * 키캡에는 자리가 없어 행정만 찍는데, 그것만으로는 어느 스위치인지 모른다.
     * 이름을 찍자니 1u 폭에 "Gateron Jade Pro" 가 안 들어간다 — 가리키는 동안
     * 화면이 읽어 주는 쪽이 맞다.
     */
    setHoverKey: (state, action: PayloadAction<number | null>) => {
      state.hoverKey = action.payload;
    },
    /*
     * ★ **아직 그 키를 가리키고 있을 때만** 지운다.
     *
     *   키에서 키로 옮기면 out(A) 와 over(B) 가 연달아 온다. 순서가 어긋나면
     *   over(B) 뒤에 out(A) 가 도착해 방금 잡은 B 를 지운다 — 판을 쓸 때마다
     *   표시가 깜빡인다. 나가는 키가 지금 값과 같을 때만 지우면 그럴 일이 없다.
     */
    clearHoverKey: (state, action: PayloadAction<number>) => {
      if (state.hoverKey === action.payload) state.hoverKey = null;
    },
    clearKeys: (state) => {
      state.selectedKeys = [];
    },
    /* 지금 화면이 그림에 칠할 것. null 이면 선택 표시로 되돌린다. */
    setOverlayKeys: (state, action: PayloadAction<number[] | null>) => {
      state.overlayKeys = action.payload;
    },

    /* 키캡 아래 막대. null 이면 막대를 안 그린다. */
    setOverlayBars: (
      state,
      action: PayloadAction<Record<number, number> | null>,
    ) => {
      state.overlayBars = action.payload;
    },

    /* 지금 입력으로 잡힌 키. null 이면 테두리를 안 그린다. */
    setOverlayPressed: (state, action: PayloadAction<number[] | null>) => {
      state.overlayPressed = action.payload;
    },

    /* 지금 프로파일. */
    setProfile: (
      state,
      action: PayloadAction<{active: number; count: number} | null>,
    ) => {
      state.profile = action.payload;
    },

    /* 프로파일을 갈아 끼우는 중. */
    setSwitching: (state, action: PayloadAction<boolean>) => {
      state.switching = action.payload;
    },

    /* 키캡 아래에 찍을 실시간 값. */
    setOverlayLive: (
      state,
      action: PayloadAction<Record<number, string> | null>,
    ) => {
      state.overlayLive = action.payload;
    },

    /*
     * 키캡 우측 위 구석의 상태 표시. null 이면 안 그린다.
     *
     * 값이 아니라 켜졌나 꺼졌나다 — 숫자는 찍을 점의 개수다. 실시간 값(overlayLive)과
     * 자리도 성격도 다르다. 이쪽은 설정이라 안 바뀌고, 저쪽은 매 프레임 바뀐다.
     */
    setOverlayBadge: (
      state,
      action: PayloadAction<Record<number, number> | null>,
    ) => {
      if (sameMap(state.overlayBadge, action.payload)) return;
      state.overlayBadge = action.payload;
    },

    /* 지금 화면이 키캡에 찍을 값. null 이면 원래 각인으로 되돌린다. */
    setOverlayText: (
      state,
      action: PayloadAction<Record<number, string> | null>,
    ) => {
      if (sameMap(state.overlayText, action.payload)) return;
      state.overlayText = action.payload;
    },
  },
});

export const {
  toggleKey,
  addKey,
  setKeys,
  clearKeys,
  setOverlayBadge,
  setHoverKey,
  clearHoverKey,
  setOverlayKeys,
  setOverlayText,
  setOverlayBars,
  setOverlayPressed,
  setOverlayLive,
  setProfile,
  setSwitching,
} = heSlice.actions;

export const getHeSelectedKeys = (state: RootState) => state.he.selectedKeys;
export const getHeOverlayKeys = (state: RootState) => state.he.overlayKeys;
export const getHeOverlayText = (state: RootState) => state.he.overlayText;
export const getHeHoverKey = (state: RootState) => state.he.hoverKey;
export const getHeOverlayBars = (state: RootState) => state.he.overlayBars;
export const getHeOverlayPressed = (state: RootState) =>
  state.he.overlayPressed;
export const getHeOverlayLive = (state: RootState) => state.he.overlayLive;
export const getHeOverlayBadge = (state: RootState) => state.he.overlayBadge;
export const getHeProfile = (state: RootState) => state.he.profile;
export const getHeSwitching = (state: RootState) => state.he.switching;

export default heSlice.reducer;
