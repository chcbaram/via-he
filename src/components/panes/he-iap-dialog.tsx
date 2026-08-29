import {useEffect, useRef, useState} from 'react';
import styled from 'styled-components';
import {useTranslation} from 'react-i18next';
import {useAppDispatch, useAppSelector} from 'src/store/hooks';
import {closeIapDialog, getHeIapDialog} from 'src/store/heSlice';
import {AccentButton} from '../inputs/accent-button';
import {AccentSelect} from '../inputs/accent-select';
import {ModalContainer} from '../inputs/dialog-base';
import {
  fwBoards,
  fwFetch,
  fwList,
  iapPresentSpec,
  iapSpecOf,
  type FwBoard,
  type FwEntry,
  type IapSpec,
} from 'src/utils/he-iap';
import {useIapFlash} from './he-iap-flash';

/*
 * he-iap-dialog — **순정 펌웨어 보드와 부트로더 보드를 다루는 전용 창.**
 *
 * ★ 왜 탭이 아니라 창인가.
 *
 *   그 보드들은 VIA 키보드 목록에 안 뜬다. 그래서 펌웨어 탭(선택된 키보드를
 *   다루는 화면)에 얹었더니 **한 화면이 두 가지를 뜻하게** 됐고, 거기서
 *   군더더기가 줄줄이 나왔다 — 대상 줄, 안내 두 개, 버전 가리기, 그리고
 *   "선택된 장치의 vid/pid 를 쓰면 안 되는" 예외. 그 예외가 뚫리면 엉뚱한
 *   키보드가 부트로더로 간다.
 *
 *   개조는 **한 번 하고 끝나는 일**이지 설정이 아니다. 창이 맞는 그릇이고,
 *   그러면 펌웨어 탭은 "선택된 키보드" 하나만 말하면 된다.
 */
const Dialog = styled.dialog`
  padding: 0;
  border-width: 0;
  background: transparent;
  &::backdrop {
    background: rgba(0, 0, 0, 0.75);
  }
`;

const Box = styled(ModalContainer)`
  align-items: stretch;
  min-width: 520px;
  gap: 14px;
`;

const Title = styled.div`
  font-size: 20px;
  font-weight: 500;
  color: var(--color_label-highlighted);
`;

const Body = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: var(--color_label);
  white-space: pre-line;
`;

const Notes = styled.ul`
  margin: 0;
  padding-left: 1.2em;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color_label);
  max-height: 8em;
  overflow-y: auto;
`;

/*
 * ★ 라벨과 컨트롤을 **격자로** 맞춘다.
 *
 *   flex + space-between 으로 두면 라벨 길이가 달라지는 만큼 컨트롤이 밀린다
 *   ("키보드" 와 "배포 버전"). 첫 칸을 고정하면 어떤 문구가 와도 줄이 맞는다.
 */
const Row = styled.div`
  display: grid;
  grid-template-columns: 6.5em minmax(0, 1fr);
  align-items: center;
  gap: 16px;
`;

/* ★ 색을 물려받지 않는다. 지정을 안 하면 문서 기본색(검정)이라 어두운 창에서 안 보인다 */
const RowLabel = styled.span`
  color: var(--color_label);
  font-size: 14px;
`;

/* 버튼 줄은 격자가 아니라 그냥 오른쪽으로 몬다 */
const Buttons = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
`;

const Err = styled(Body)`
  color: #d66;
`;

const Bar = styled.div<{$pct: number}>`
  height: 6px;
  border-radius: 3px;
  background: var(--bg_control);
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${(p) => p.$pct}%;
    background: var(--color_accent);
    transition: width 0.15s linear;
  }
`;

export const HeIapDialog = () => {
  const {t} = useTranslation();
  const dispatch = useAppDispatch();
  const open = useAppSelector(getHeIapDialog);
  const ref = useRef<HTMLDialogElement>(null);

  const [spec, setSpec] = useState<IapSpec | null>(null);
  const [boards, setBoards] = useState<FwBoard[]>([]);
  const [board, setBoard] = useState<FwBoard | null>(null);
  const [rel, setRel] = useState<FwEntry[]>([]);
  const [pick, setPick] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const fw = useIapFlash();

  /* <dialog> 는 명령형이다 — 열고 닫는 것을 상태에 맞춘다 */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /*
   * 어느 보드인지는 **붙어 있는 채널이 알려준다.** 그 보드들은 이름을 말해 주지
   * 않는다 — 부트로더에는 INFO 가 없고 순정 앱은 우리 명령에 답하지 않는다.
   */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fw.setErr(null);
    Promise.all([fwBoards().catch(() => []), iapPresentSpec().catch(() => null)])
      .then(([bs, sp]) => {
        if (!alive) return;
        setBoards(bs);
        setSpec(sp);
        const hit = sp ? bs.filter((b) => (b.iap ?? 'wish60') === sp.id) : [];
        setBoard(hit.length === 1 ? hit[0] : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    setRel([]);
    setPick(0);
    if (!board) return;
    let alive = true;
    fwList(board.dir)
      .then((l) => alive && setRel(l))
      .catch(() => alive && setRel([]));
    return () => {
      alive = false;
    };
  }, [board]);

  const sel = rel[pick];
  const done = fw.progress?.phase === 'done';
  const pct =
    fw.progress?.phase === 'write' && fw.progress.total
      ? Math.round((fw.progress.sent * 100) / fw.progress.total)
      : done
      ? 100
      : 0;

  const close = () => dispatch(closeIapDialog());

  return (
    <Dialog ref={ref} onCancel={(e) => {
      e.preventDefault();
      if (!fw.busy) close();
    }}>
      <Box>
        <Title>{t('he.iapDlg.title', {name: board?.name ?? t('the other board')})}</Title>
        <Body>{t('he.iapDlg.body')}</Body>

        {boards.length > 1 && (
          <Row>
            <RowLabel>{t('Keyboard')}</RowLabel>
            <AccentSelect
              width={280}
              value={board ? {label: board.name, value: board.dir} : null}
              placeholder={t('Pick your keyboard')}
              options={boards.map((b) => ({label: b.name, value: b.dir}))}
              onChange={(o: any) =>
                setBoard(boards.find((b) => b.dir === o?.value) ?? null)
              }
            />
          </Row>
        )}

        {rel.length > 0 && (
          <>
            <Row>
              <RowLabel>{t('Release version')}</RowLabel>
              <AccentSelect
                width={280}
                value={{
                  label: `${rel[pick].version}  (${rel[pick].date})`,
                  value: pick,
                }}
                options={rel.map((r, i) => ({
                  label: `${r.version}  (${r.date})`,
                  value: i,
                }))}
                onChange={(o: any) => setPick(o?.value ?? 0)}
              />
            </Row>
            {sel?.notes?.length ? (
              <Notes>
                {sel.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </Notes>
            ) : null}
          </>
        )}

        {fw.progress && <Bar $pct={pct} />}
        {fw.err && <Err>{fw.err}</Err>}
        {done && <Body>{t('he.iapDlg.done')}</Body>}

        <Buttons>
          <AccentButton disabled={fw.busy} onClick={close}>
            {done ? t('Close') : t('Cancel')}
          </AccentButton>
          <AccentButton
            disabled={fw.busy || !board}
            onClick={() => file.current?.click()}
          >
            {t('Choose .bin')}
          </AccentButton>
          <AccentButton
            disabled={fw.busy || !board || !sel}
            onClick={async () => {
              if (!board || !sel) return;
              try {
                await fw.flash(iapSpecOf(board), await fwFetch(board.dir, sel));
              } catch (x) {
                fw.setErr(String(x));
              }
            }}
          >
            {t('he.fw.flash')}
          </AccentButton>
        </Buttons>

        <input
          ref={file}
          type="file"
          accept=".bin"
          style={{display: 'none'}}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f || !board) return;
            await fw.flash(iapSpecOf(board), new Uint8Array(await f.arrayBuffer()));
          }}
        />
      </Box>
    </Dialog>
  );
};
