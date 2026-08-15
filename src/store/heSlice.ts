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
};

const initialState: HeState = {
  selectedKeys: [],
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
  },
});

export const {toggleKey, addKey, setKeys, clearKeys} = heSlice.actions;

export const getHeSelectedKeys = (state: RootState) => state.he.selectedKeys;

export default heSlice.reducer;
