import React, {useState, useEffect, useRef} from 'react';
import styled from 'styled-components';
import {useAppSelector} from 'src/store/hooks';
import {getShowSliderValuesMode} from 'src/store/settingsSlice';
import {NumberInput} from 'src/components/panes/configure-panes/submenus/macros/keycode-sequence-components';

const Container = styled.span<{$mode?: number}>`
  display: inline-flex;
  align-items: center; /* Changed from space-between to center */
  line-height: initial;
  gap: ${(props) => (props.$mode === 1 ? '10px' : '8px')};
  width: ${(props) => {
    switch (props.$mode) {
      case 0:
        return '200px'; // Slider only
      case 1:
        return 'auto'; // Slider + value display
      case 2:
        return '280px'; // Slider + input field
      default:
        return '200px';
    }
  }};
`;

const SliderInput = styled.input.attrs({type: 'range'})<any>`
  accent-color: var(--color_accent);
  width: ${(props) => {
    switch (props.$mode) {
      case 0:
        return '100%'; // Full width when alone
      case 1:
        return '200px'; // Fixed width with value display
      case 2:
        return '180px'; // Smaller with input field
      default:
        return '100%';
    }
  }};
  flex: none;
`;

export const RangeValueDisplay = styled.span`
  text-align: right;
  font-size: 20px;
  color: var(--color_label_highlighted);
  white-space: nowrap;
  min-width: 40px;
`;

/*
 * 단위가 붙은 값 표시 — **폭이 변하면 안 된다.**
 *
 * 그냥 두면 자릿수와 글자 모양에 따라 폭이 들썩여 슬라이더가 좌우로 밀린다. 끌고
 * 있는 도중에 막대가 움직이면 겨냥이 흔들린다.
 *
 *   tabular-nums   숫자마다 폭이 같아진다 (1 과 8 이 같은 자리를 쓴다)
 *   min-width      "100 ms" 와 "500 ms" 가 같은 자리를 차지하게 넉넉히 잡는다
 */
const UnitValueDisplay = styled(RangeValueDisplay)`
  font-variant-numeric: tabular-nums;
  min-width: 4.5em;
`;

const StyledNumberInput = styled(NumberInput)`
  width: 80px;
  flex: none;
`;

export const AccentRange: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
    onChange: (x: number) => void;
    /*
     * 값 옆에 붙일 단위 (예: "ms").
     *
     * ★ 단위가 있으면 값을 **항상** 보여준다. "Slider Only" 설정이라도 그렇다 —
     *   시간값은 눈금 없는 막대만 봐서는 지금 몇인지 알 길이 없다.
     *
     * ★ props 에서 빼내야 한다. 그대로 두면 {...props} 로 <input> 에 흘러들어가
     *   React 가 모르는 속성이라고 경고한다.
     */
    unit?: string;
  }
> = ({unit, ...props}) => {
  // Get the display mode from Redux store (0, 1, or 2)
  const displayMode = useAppSelector(getShowSliderValuesMode);

  // Convert string mode to numeric mode
  const rawMode =
    displayMode === 'Slider Only'
      ? 0
      : displayMode === 'Slider & Show Value'
        ? 1
        : displayMode === 'Slider & Input Field'
          ? 2
          : 0;

  /*
   * ★ 단위가 붙으면 폭 계산도 "값 + 슬라이더" 쪽을 써야 한다.
   *
   *   0번(슬라이더만)은 상자를 200px 로 못박고 슬라이더를 100% 로 채운다. 거기에
   *   값 표시를 하나 더 끼우면 상자를 넘어서, 그 줄만 오른쪽으로 삐져나와 위아래
   *   토글과 끝이 안 맞았다. 1번은 상자가 내용에 맞춰 잡히므로 줄이 다시 선다.
   */
  const numericMode = unit ? 1 : rawMode;

  const currentValue = Number(
    props.value ?? props.defaultValue ?? props.min ?? 0,
  );
  const [draftValue, setDraftValue] = useState(String(currentValue));
  const isEditing = useRef(false);
  const cancelDraft = useRef(false);

  useEffect(() => {
    if (!isEditing.current) {
      setDraftValue(String(currentValue));
    }
  }, [currentValue]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = +e.target.value;
    props.onChange(newValue);
  };

  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftValue(e.target.value);
  };

  const handleNumberInputBlur = () => {
    isEditing.current = false;
    if (cancelDraft.current) {
      cancelDraft.current = false;
      setDraftValue(String(currentValue));
      return;
    }

    const parsedValue = Number(draftValue);
    if (
      draftValue.trim() === '' ||
      !Number.isFinite(parsedValue) ||
      !Number.isInteger(parsedValue)
    ) {
      setDraftValue(String(currentValue));
      return;
    }
    if (parsedValue !== currentValue) {
      // Keep the controlled value authoritative. The parent may constrain the
      // requested value, including resolving it back to currentValue.
      setDraftValue(String(currentValue));
      props.onChange(parsedValue);
    } else {
      setDraftValue(String(currentValue));
    }
  };

  const handleNumberInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      cancelDraft.current = true;
      e.currentTarget.blur();
    }
  };

  return (
    <Container $mode={numericMode}>
      {/* Mode 1: Show value display — 단위가 있으면 설정과 무관하게 늘 보여준다 */}
      {unit ? (
        <UnitValueDisplay>
          {currentValue} {unit}
        </UnitValueDisplay>
      ) : (
        numericMode === 1 && <RangeValueDisplay>{currentValue}</RangeValueDisplay>
      )}

      {/* Always show slider */}
      <SliderInput
        {...props}
        $mode={numericMode} /* Pass numeric mode here too */
        value={currentValue}
        onChange={handleSliderChange}
      />

      {/* Mode 2: Show input field */}
      {numericMode === 2 && (
        <StyledNumberInput
          {...props}
          type="number"
          value={draftValue}
          onFocus={() => {
            isEditing.current = true;
          }}
          onChange={handleNumberInputChange}
          onBlur={handleNumberInputBlur}
          onKeyDown={handleNumberInputKeyDown}
        />
      )}
    </Container>
  );
};
