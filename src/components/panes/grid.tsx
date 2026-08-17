import React, {useLayoutEffect, useRef, useState} from 'react';
import getIconColor from '../icons/get-icon-color';
import styled from 'styled-components';

export const Grid = styled.div`
  height: 100%;
  width: 100%;
  display: grid;
  grid-template-columns: min-content min-content minmax(0, 1fr);
  > div {
    pointer-events: all;
  }
`;

export const Cell = styled.div`
  border-right: 1px solid var(--border_color_cell);
`;

export const MenuCell = styled(Cell)`
  background: var(--bg_menu);
  border-top: 1px solid var(--border_color_cell);
`;

export const OverflowCell = styled(Cell)`
  border-top: 1px solid var(--border_color_cell);
  overflow: auto;
`;

export const SpanOverflowCell = styled(Cell)`
  border-top: 1px solid var(--border_color_cell);
  overflow: auto;
  grid-column: span 2;
`;

export const SubmenuCell = styled(Cell)`
  border-top: 1px solid var(--border_color_cell);
  background: var(--bg_control);
`;

export const SubmenuOverflowCell = styled(SubmenuCell)`
  min-width: 80px;
  overflow: auto;
  overflow-x: hidden; /* Override just the horizontal part */
`;

/*
 * ★ (상류 대비 수정) 내용을 **창 한가운데**에 둔다.
 *
 *   위쪽 키보드 그림은 창 중앙에 그려지는데 아래 내용 칸은 왼쪽 메뉴 폭만큼 오른쪽으로
 *   밀려 있었다. 둘의 중심이 어긋나 화면이 한쪽으로 쏠려 보인다.
 *
 *   왼쪽에 밀린 만큼을 오른쪽에도 **여백**으로 둔다. 그러면 내용 칸의 가운데가 창의
 *   가운데와 맞아 키보드 그림과 축이 나란해진다.
 *
 * ★ 폭은 **재서** 얻는다. 숫자로 박지 않는다.
 *
 *   왼쪽에 무엇이 있는지가 화면마다 다르다 — 아이콘 레일뿐인 곳(SpanOverflowCell)도
 *   있고 하위 메뉴가 붙는 곳도 있다. 같은 화면 안에서도 하위 메뉴는 글자 길이를 따라
 *   늘고, 언어를 바꾸면 또 달라진다. 그래서 **그리드 안에서 이 칸이 얼마나 밀렸는지**를
 *   그대로 읽는다. 왼쪽에 무엇이 오든 맞는다.
 *
 * ★ 처음엔 왼쪽 메뉴를 한 벌 더 그려 안 보이게 두는 쪽으로 했다가 물렀다.
 *
 *   폭은 정확히 맞았지만, 그 빈 칸을 그리드의 단으로 빼자 내용 칸이 창 끝까지 못 미쳐
 *   **스크롤 막대가 화면 한가운데 세로로 섰다.** 칸 안쪽으로 옮겨 그건 풀었는데,
 *   Configure 는 하위 화면이 여덟이고 레일 메뉴가 상위(configure.tsx)에 있어 베낄
 *   수가 없다. 재는 쪽은 무엇을 베낄지 몰라도 되므로 어디에나 같은 방식으로 쓴다.
 *
 * ★ 여백이지 이동(transform)이 아니다.
 *
 *   transform 은 레이아웃을 안 건드려 싸지만, 창이 좁아지면 내용의 **왼쪽이 잘려**
 *   나간다. 여백은 좁아질 뿐이라 잘리지 않는다.
 *
 * ★ 좁아지면 여백부터 내준다.
 *
 *   내용이 쓸 폭이 MIN_CONTENT 아래로 내려가면 그만큼 여백을 줄인다. 한 번에 0 으로
 *   끊지 않으므로 창을 줄이는 동안 내용이 튀지 않는다.
 *
 * ★ 되먹임은 없다.
 *
 *   여백은 이 칸 **안쪽**을 줄일 뿐이고, 칸의 폭은 그리드가 정한다. 스팬하는 칸도
 *   유연한 단(minmax(0,1fr))을 걸치므로 제 내용이 왼쪽 단 폭을 밀지 않는다.
 */
const MIN_CONTENT = 700;

const useCenterGutter = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [gutter, setGutter] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const grid = el?.parentElement;
    if (!el || !grid) return;

    const measure = () => {
      const cell = el.getBoundingClientRect();
      const left = cell.left - grid.getBoundingClientRect().left;
      setGutter(
        Math.round(Math.max(0, Math.min(left, cell.width - MIN_CONTENT))),
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el, {box: 'border-box'});
    ro.observe(grid, {box: 'border-box'});
    return () => ro.disconnect();
  }, []);

  return [ref, gutter] as const;
};

type CellProps = React.ComponentProps<typeof OverflowCell>;

/* 쓰는 쪽은 이름만 바꾸면 된다 — 스크롤 막대와 테두리는 창 끝에 그대로 있다 */
export const CenteredOverflowCell: React.FC<CellProps> = ({style, ...rest}) => {
  const [ref, gutter] = useCenterGutter();
  return (
    <OverflowCell ref={ref} style={{...style, paddingRight: gutter}} {...rest} />
  );
};

export const CenteredSpanOverflowCell: React.FC<CellProps> = ({
  style,
  ...rest
}) => {
  const [ref, gutter] = useCenterGutter();
  return (
    <SpanOverflowCell
      ref={ref}
      style={{...style, paddingRight: gutter}}
      {...rest}
    />
  );
};

export const SinglePaneFlexCell = styled(Cell)`
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
`;

export const ConfigureFlexCell = styled(SinglePaneFlexCell)`
  pointer-events: none;
  height: 500px;
`;

export const CategoryIconContainer = styled.span<{$selected?: boolean}>`
  position: relative;
  color: var(--color_inside-accent);
  height: 35px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${(props) =>
    props.$selected ? 'var(--color_accent)' : 'transparent'};
  border-radius: 10px;
  width: 40px;
  &:hover {
    color: ${(props) =>
      props.$selected ? 'var(--color_inside-accent)' : 'var(--color_accent)'};
    & .tooltip {
      transform: scale(1) translateX(0px);
      opacity: 1;
    }
  }
  .tooltip {
    transform: translateX(-5px) scale(0.6);
    opacity: 0;
  }
`;

export const IconContainer = styled.span`
  display: inline-block;
  text-align: center;
  width: 35px;
  position: relative;
  &:hover > span > div {
    background-color: red;
  }
`;

export const ControlRow = styled.div`
  position: relative;
  width: 100%;
  max-width: 960px;
  border-bottom: 1px solid var(--border_color_cell);
  font-size: 20px;
  justify-content: space-between;
  display: flex;
  line-height: 50px;
  min-height: 50px;
  box-sizing: border-box;
  padding-left: 5px;
  padding-right: 5px;
`;

export const IndentedControlRow = styled(ControlRow)`
  padding-left: 17px;
`;

export const Label = styled.label`
  color: var(--color_label);
  font-weight: 400;
`;

export const SubLabel = styled(Label)`
  font-size: 18px;
  font-style: italic;
  font-weight: 400;
`;

export const Detail = styled.span`
  color: var(--color_accent);
  display: flex;
  align-items: center;
`;

export const Row = styled.div<{$selected: boolean}>`
  cursor: pointer;
  white-space: nowrap;
  margin-bottom: 15px;
  font-size: 20px;
  line-height: 20px;
  text-transform: uppercase;
  color: ${(props) => getIconColor(props.$selected).style.color};
  border-left: 2px solid transparent;

  svg {
    height: 20px;
    vertical-align: middle;
  }

  &:hover {
    color: var(--color_label-highlighted);
    & .tooltip {
      transform: scale(1) translateX(0px);
      opacity: 1;
    }
  }
  .tooltip {
    transform: translateX(-5px) scale(0.6);
    opacity: 0;
  }
`;

export const SubmenuRow = styled(Row)`
  background: ${(props) => (props.$selected ? 'var(--bg_icon)' : 'inherit')};
  padding: 4px 8px;
  font-weight: 400;
  min-width: min-content;
  border-color: transparent;
  margin-bottom: 11px;
  color: ${(props) =>
    props.$selected ? 'var(--color_label-highlighted)' : 'var(--color_label)'};
  border-radius: 12px;
`;
