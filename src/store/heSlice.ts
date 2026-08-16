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

  /*
   * 키캡 아래 막대 (0~1) — **지금 상태**다. 매트릭스 인덱스로 넣는다.
   *
   * 글자와 통로를 따로 둔다. 글자는 설정값이라 가끔 바뀌지만 막대는 누르는 동안
   * 계속 움직인다 — 한 통로에 섞으면 막대가 움직일 때마다 글자까지 다시 그린다.
   */
  overlayBars: Record<number, number> | null;

  /* 지금 입력으로 잡힌 키 (매트릭스 인덱스). 막대와 다른 것이다 */
  overlayPressed: number[] | null;
};

const initialState: HeState = {
  selectedKeys: [],
  overlayKeys: null,
  overlayText: null,
  overlayBars: null,
  overlayPressed: null,
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

    /* 지금 화면이 키캡에 찍을 값. null 이면 원래 각인으로 되돌린다. */
    setOverlayText: (
      state,
      action: PayloadAction<Record<number, string> | null>,
    ) => {
      state.overlayText = action.payload;
    },
  },
});

export const {
  toggleKey,
  addKey,
  setKeys,
  clearKeys,
  setOverlayKeys,
  setOverlayText,
  setOverlayBars,
  setOverlayPressed,
} = heSlice.actions;

export const getHeSelectedKeys = (state: RootState) => state.he.selectedKeys;
export const getHeOverlayKeys = (state: RootState) => state.he.overlayKeys;
export const getHeOverlayText = (state: RootState) => state.he.overlayText;
export const getHeOverlayBars = (state: RootState) => state.he.overlayBars;
export const getHeOverlayPressed = (state: RootState) =>
  state.he.overlayPressed;

export default heSlice.reducer;
