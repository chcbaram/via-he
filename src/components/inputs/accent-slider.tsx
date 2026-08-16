import React, {useRef} from 'react';
import styled from 'styled-components';

export const HiddenInput = styled.input`
  opacity: 0;
  width: 0;
  height: 0;
`;

const Switch = styled.label`
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
`;
const Slider = styled.span<{$ischecked?: boolean; $disabled?: boolean}>`
  position: absolute;
  cursor: ${(props) => (props.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.$disabled ? 0.4 : 1)};
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${(props) =>
    props.$ischecked ? 'var(--color_accent)' : 'var(--bg_control)'};
  -webkit-transition: 0.4s;
  transition: 0.4s;
  border-radius: 4px;
  &:before {
    position: absolute;
    content: '';
    height: 26px;
    width: 26px;
    left: 4px;
    bottom: 4px;
    border-radius: 4px;
    background-color: ${(props) =>
      !props.$ischecked ? 'var(--bg_icon)' : 'var(--color_inside-accent)'};
    -webkit-transition: 0.4s;
    transition: 0.4s;
    ${(props) => (props.$ischecked ? 'transform: translateX(26px)' : '')};
  }
`;

type Props = {
  isChecked: boolean;
  onChange: (val: boolean) => void;
  /*
   * 끌 수 있게 한다.
   *
   * 라벨 안의 체크박스를 disabled 로 두면 라벨을 눌러도 아무 일도 일어나지 않는다
   * (HTML 규격 — 비활성 컨트롤은 라벨의 활성화를 받지 않는다). 부모에서
   * pointer-events 로 덮지 않는 것이 중요하다 — 그 그물은 넓어서 옆 것까지 먹는다.
   */
  disabled?: boolean;
};

export function AccentSlider(props: Props) {
  const {isChecked, onChange, disabled} = props;

  const [isHiddenChecked, setIsHiddenChecked] = React.useState(isChecked);
  const ref = useRef<HTMLInputElement>(null);

  // If the parent isChecked changes, update our local checked state
  React.useEffect(() => {
    setIsHiddenChecked(isChecked);
  }, [isChecked]);

  const hiddenOnChange = () => {
    if (disabled) return;
    const newIsChecked = !isChecked;
    setIsHiddenChecked(newIsChecked);
    onChange(newIsChecked);
    if (ref.current) {
      ref.current.blur();
    }
  };

  return (
    <Switch>
      <HiddenInput
        ref={ref}
        type="checkbox"
        checked={isHiddenChecked}
        disabled={disabled}
        onChange={hiddenOnChange}
      />
      <Slider $ischecked={isHiddenChecked} $disabled={disabled} />
    </Switch>
  );
}
