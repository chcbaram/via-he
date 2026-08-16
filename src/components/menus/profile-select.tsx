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
 * ★ 생김새도 배지를 그대로 따른다.
 *
 *   처음에는 1~4 를 나란히 늘어놓았다. 나란한 버튼은 자리를 많이 먹어 글자를 작게
 *   할 수밖에 없었고, 그러니 같은 줄의 키보드 이름보다 작아 다른 부류처럼 보였다.
 *   옆에 놓이는 것은 같은 모양이어야 한 줄로 읽힌다.
 *
 *   늘어놓기는 개수가 늘면 무너지기도 한다. 목록은 넷이든 여덟이든 같다.
 *
 * ★ 상태는 리덕스에 둔다.
 *
 *   HE 화면도 같은 값을 본다. 여기서 바꾼 것을 그쪽이 모르면, 옛 프로파일의 숫자를
 *   새 것인 척 보여주다가 그 위에 덮어쓴다.
 */
import React, {useEffect, useState} from 'react';
import styled from 'styled-components';
import {useTranslation} from 'react-i18next';
import {faAngleDown} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {getSelectedKeyboardAPI} from 'src/store/devicesSlice';
import {getHeProfile, setProfile} from 'src/store/heSlice';
import {heMakeSend, heProfGet, heProfSet} from 'src/utils/he-api';

/*
 * 키보드 이름 배지가 오른끝(right: 15px)이고, 그 왼쪽 자리를 쓴다.
 * 원래 호스트 자판 배열 알약이 있던 자리다 — 그건 한 번 정하고 잊는 값이라
 * 레이아웃 화면으로 내려갔고, 늘 보이는 이 자리는 자주 바꾸는 프로파일이 받는다.
 */
const Container = styled.div`
  position: absolute;
  right: 220px;
  top: 0px;
  font-size: 18px;
  pointer-events: none;
  font-weight: 400;
`;

/* badge.tsx 의 KeyboardTitle 과 같은 규칙 — 위 테두리 없이 아래로 떨어지는 알약 */
const Title = styled.label`
  pointer-events: all;
  display: inline-block;
  background: var(--color_accent);
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  font-size: 18px;
  text-transform: uppercase;
  color: var(--color_inside-accent);
  padding: 1px 10px;
  margin-right: 10px;
  border: solid 1px var(--bg_control);
  border-top: none;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.1s ease-out;
  &:hover {
    filter: brightness(0.7);
  }
`;

const List = styled.ul<{$show: boolean}>`
  padding: 0;
  border: 1px solid var(--bg_control);
  width: 160px;
  border-radius: 6px;
  background-color: var(--bg_menu);
  margin: 0;
  margin-top: 5px;
  right: 10px;
  position: absolute;
  pointer-events: ${(p) => (p.$show ? 'all' : 'none')};
  transition: all 0.2s ease-out;
  z-index: 11;
  opacity: ${(p) => (p.$show ? 1 : 0)};
  overflow: hidden;
  transform: ${(p) => (p.$show ? 0 : `translateY(-5px)`)};
`;

const Item = styled.button<{$selected?: boolean}>`
  display: block;
  text-align: center;
  outline: none;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  width: 100%;
  border: none;
  padding: 8px 0;
  cursor: pointer;
  font-size: 16px;
  background: ${(p) => (p.$selected ? 'var(--bg_control)' : 'var(--bg_menu)')};
  color: ${(p) =>
    p.$selected
      ? 'var(--color_control-highlighted)'
      : 'var(--color_label-highlighted)'};
  &:hover {
    background: var(--bg_control);
    color: var(--color_control-highlighted);
  }
`;

const ClickCover = styled.div`
  position: fixed;
  z-index: 10;
  pointer-events: all;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: 0.4;
  background: rgba(0, 0, 0, 0.75);
`;

export const ProfileSelect = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();
  const api = useAppSelector(getSelectedKeyboardAPI);
  const prof = useAppSelector(getHeProfile);
  const [showList, setShowList] = useState(false);

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
    setShowList(false);
    if (i === prof.active) return;
    try {
      dispatch(setProfile(await heProfSet(heMakeSend(api), i)));
    } catch {
      /* 못 바꿨으면 표시도 그대로 둔다 */
    }
  };

  return (
    <Container>
      <Title onClick={() => setShowList(!showList)}>
        {t('Profile')} {prof.active + 1}
        <FontAwesomeIcon
          icon={faAngleDown}
          style={{
            transform: showList ? 'rotate(180deg)' : '',
            transition: 'transform 0.2s ease-out',
            marginLeft: '5px',
          }}
        />
      </Title>
      {showList && <ClickCover onClick={() => setShowList(false)} />}
      <List $show={showList}>
        {Array.from({length: prof.count}, (_, i) => (
          <Item key={i} $selected={i === prof.active} onClick={() => pick(i)}>
            {t('Profile')} {i + 1}
          </Item>
        ))}
      </List>
    </Container>
  );
};
