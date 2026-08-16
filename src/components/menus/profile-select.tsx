/*
 * profile-select.tsx — 키보드 이름 배지 옆의 프로파일 선택
 *
 * ★ 왜 화면 안이 아니라 여기인가.
 *
 *   프로파일은 보드 **전체**의 상태다. 키맵을 짜는 중이든 조명을 고르는 중이든
 *   "지금 몇 번을 쓰고 있나" 는 늘 유효한 물음이고, 그 답이 안 보이면 아래에서
 *   만지는 값이 어디에 들어가는지 모른 채로 만지게 된다.
 *
 *   그래서 **키보드가 연결되면 뜨는 그 배지 옆**에 붙인다. 둘 다 "지금 무엇을
 *   보고 있나" 를 말하는 자리라 같은 줄에 있는 것이 맞다.
 *
 * ★ 상태는 리덕스에 둔다.
 *
 *   HE 화면도 같은 값을 본다. 여기서 바꾼 것을 그쪽이 모르면, 옛 프로파일의 숫자를
 *   새 것인 척 보여주다가 그 위에 덮어쓴다.
 */
import React, {useEffect} from 'react';
import styled from 'styled-components';
import {useTranslation} from 'react-i18next';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {getSelectedKeyboardAPI} from 'src/store/devicesSlice';
import {getHeProfile, setProfile} from 'src/store/heSlice';
import {heMakeSend, heProfGet, heProfSet} from 'src/utils/he-api';

/*
 * 배지와 같은 생김새 — 위쪽 모서리만 붙어 아래로 떨어지는 알약.
 *
 * 키보드 이름 배지의 규칙(위 테두리 없음, 아래 모서리만 둥글게)을 그대로 따른다.
 * 나란히 놓이는 두 조각이 서로 다른 모양이면 한 줄로 안 읽힌다.
 */
/*
 * 키보드 이름 배지가 오른끝(right: 15px)이고, 그 왼쪽 자리를 쓴다.
 * 원래 호스트 자판 배열 알약이 있던 자리다 — 그건 한 번 정하고 잊는 값이라
 * 레이아웃 화면으로 내려갔고, 늘 보이는 이 자리는 자주 바꾸는 프로파일이 받는다.
 */
const Anchor = styled.div`
  position: absolute;
  right: 220px;
  top: 0px;
  pointer-events: none;
  font-weight: 400;
`;

const Row = styled.span`
  pointer-events: all;
  display: inline-flex;
  align-items: stretch;
  margin-right: 10px;
  border: solid 1px var(--bg_control);
  border-top: none;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  overflow: hidden;
  vertical-align: top;
`;

const Name = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: 13px;
  text-transform: uppercase;
  color: var(--color_label);
  background: var(--bg_menu);
`;

const Btn = styled.button<{$on: boolean}>`
  min-width: 26px;
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  background: ${(p) => (p.$on ? 'var(--color_accent)' : 'var(--bg_menu)')};
  color: ${(p) =>
    p.$on ? 'var(--color_inside-accent)' : 'var(--color_label)'};
  &:hover {
    filter: brightness(0.8);
  }
`;

export const ProfileSelect = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();
  const api = useAppSelector(getSelectedKeyboardAPI);
  const prof = useAppSelector(getHeProfile);

  /*
   * 장치가 바뀌면 다시 읽는다.
   *
   * 실패하면 조용히 지운다 — HE 명령을 모르는 보드일 수 있고, 그때 오류를 쌓으면
   * 진짜 오류를 못 본다.
   */
  useEffect(() => {
    if (!api) {
      dispatch(setProfile(null));
      return;
    }
    let alive = true;
    heProfGet(heMakeSend(api))
      .then((p) => alive && dispatch(setProfile(p)))
      .catch(() => alive && dispatch(setProfile(null)));
    return () => {
      alive = false;
    };
  }, [api, dispatch]);

  if (!api || !prof || prof.count === 0) return null;

  const pick = async (i: number) => {
    if (i === prof.active) return;
    try {
      dispatch(setProfile(await heProfSet(heMakeSend(api), i)));
    } catch {
      /* 못 바꿨으면 표시도 그대로 둔다 */
    }
  };

  return (
    <Anchor>
      <Row title={t('Profile')}>
        <Name>{t('Profile')}</Name>
        {Array.from({length: prof.count}, (_, i) => (
          <Btn key={i} $on={i === prof.active} onClick={() => pick(i)}>
            {i + 1}
          </Btn>
        ))}
      </Row>
    </Anchor>
  );
};
