#!/usr/bin/env python3
"""
VIA 채널(0xFF60/0x61) 통신 점검·부하 시험.

브라우저를 끼우지 않고 같은 명령을 같은 방식으로 보내 본다. 앱에서
`NotAllowedError: Failed to write the report` 가 날 때, 여기서도 나면
장치·선·허브 쪽이고 여기서 안 나면 브라우저(WebHID) 쪽이다.

읽기 명령만 쓴다 — 장치에 아무것도 쓰지 않는다.

    pip install hidapi          # macOS 는 brew install hidapi 도 필요
    python3 scripts/via-probe.py --list
    python3 scripts/via-probe.py --vid 0x28E9 --pid 0xCB60 -n 2000
    python3 scripts/via-probe.py --vid 0x28E9 --pid 0xCB60 -n 5000 --gap 0
"""

import argparse
import statistics
import sys
import time

try:
    import hid
except ImportError:
    sys.exit("[E_] hidapi 가 없다: pip install hidapi")

VIA_USAGE_PAGE = 0xFF60
VIA_USAGE = 0x61
REPORT_LEN = 32  # VIA 는 32바이트 고정, 리포트 ID 는 0

# 앱이 붙을 때 실제로 쓰는 읽기 명령들 (keyboard-api.ts 의 APICommand)
GET_PROTOCOL_VERSION = 0x01
DYNAMIC_KEYMAP_GET_LAYER_COUNT = 0x11
DYNAMIC_KEYMAP_GET_BUFFER = 0x12


def find(vid, pid):
    """VIA 채널 인터페이스를 골라낸다. usage 정보가 없는 platform 은 후보를 다 준다."""
    hits, fallback = [], []
    for d in hid.enumerate(vid or 0, pid or 0):
        if d.get("usage_page") == VIA_USAGE_PAGE and d.get("usage") == VIA_USAGE:
            hits.append(d)
        else:
            fallback.append(d)
    return hits or fallback


def cmd_bytes(command, args=()):
    return bytes([command, *args])


def send(dev, payload, timeout_ms=1000):
    """보내고 짝이 맞는 답을 받는다. (걸린 시간, 응답, 사유) 를 준다.

    hidapi 는 쓰기 실패에 예외를 던지지 않고 **-1 을 낸다.** 그걸 놓치면 쓰기 실패가
    읽기 시간초과로 둔갑한다 — 원인이 정반대인데 같은 증상으로 보인다.
    """
    t0 = time.perf_counter()
    try:
        written = dev.write(bytes([0x00]) + payload.ljust(REPORT_LEN, b"\x00"))
    except (OSError, ValueError) as e:
        return (time.perf_counter() - t0) * 1000, None, f"write: {e}"
    if written < 0:
        err = dev.error()
        why = "unplug" if "not responding" in err else f"write: {err}"
        return (time.perf_counter() - t0) * 1000, None, why

    # 안 막히는 읽기로 직접 재야 시간 제한이 실제로 걸린다
    deadline = t0 + timeout_ms / 1000
    resp = []
    while not resp and time.perf_counter() < deadline:
        resp = dev.read(REPORT_LEN)
        if not resp:
            time.sleep(0.0002)
    ms = (time.perf_counter() - t0) * 1000
    if not resp:
        return ms, None, "read timeout"
    if bytes(resp[: len(payload)]) != payload:
        return ms, resp, f"echo mismatch: 보낸 {payload.hex()} / 받은 {bytes(resp[:8]).hex()}"
    return ms, resp, None


def run_once(target, n, gap, stop_after, label=""):
    """한 판 돌린다. (성공 회수, 첫 실패 회차, 응답시간 목록) 를 준다."""
    dev = hid.device()
    dev.open_path(target["path"])
    dev.set_nonblocking(1)

    # 붙을 때의 부하를 흉내낸다: 키맵 버퍼 읽기가 회수로 압도적이다
    plan = [
        cmd_bytes(GET_PROTOCOL_VERSION),
        cmd_bytes(DYNAMIC_KEYMAP_GET_LAYER_COUNT),
        *[
            cmd_bytes(DYNAMIC_KEYMAP_GET_BUFFER, [(o >> 8) & 0xFF, o & 0xFF, 28])
            for o in range(0, 28 * 8, 28)
        ],
    ]

    lat, fails, first_fail, unplugged = [], [], None, False
    t_start = time.perf_counter()
    for i in range(n):
        ms, _resp, why = send(dev, plan[i % len(plan)])
        if why == "unplug":
            print(f"{label}{i}회까지 무사 — 여기서 뽑혔다 (고장 아님)")
            unplugged = True
            break
        if why:
            if first_fail is None:
                first_fail = i
            fails.append(why)
            print(f"{label}[E_] {i:5d}회 {ms:7.1f}ms  {why}")
            if stop_after and len(fails) >= stop_after:
                break
        else:
            lat.append(ms)
        if gap:
            time.sleep(gap / 1000)
    elapsed = time.perf_counter() - t_start
    dev.close()

    done = len(lat) + len(fails)
    verdict = "뽑혀서 중단" if unplugged else ("굳음" if first_fail is not None else "끝까지 무사")
    line = f"{label}{done}회 / {elapsed:.1f}초 — {verdict}"
    if first_fail is not None:
        line += f", 첫 실패 {first_fail}회째"
    if lat:
        o = sorted(lat)
        line += f"  |  중간 {statistics.median(o):.2f}ms p99 {o[int(len(o) * 0.99)]:.2f}ms"
    print(line)
    return first_fail


def watch(vid, pid, n, gap, stop_after):
    """뽑았다 꽂을 때마다 한 판씩 돌린다.

    재열거되면 path(DevSrvsID)가 바뀐다 — 그걸 새 판의 신호로 쓴다.
    """
    print("장치를 뽑았다 꽂으면 한 판씩 잰다. 끝내려면 Ctrl-C.\n")
    seen, round_no = None, 0
    while True:
        found = find(vid, pid)
        path = found[0]["path"] if found else None
        if path and path != seen:
            seen = path
            round_no += 1
            print(f"--- {round_no}판 ({time.strftime('%H:%M:%S')})")
            # 열거 직후엔 아직 못 연다 — 자리잡을 때까지 몇 번 다시 해 본다
            for attempt in range(12):
                time.sleep(0.5)
                try:
                    run_once(found[0], n, gap, stop_after, label="    ")
                    break
                except OSError:
                    continue
            else:
                print("    [E_] 끝내 열지 못했다 — 이 판은 버린다")
            print()
        elif not path and seen:
            seen = None  # 뽑혔다 — 다음 꽂기를 기다린다
        time.sleep(0.2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--list", action="store_true", help="HID 인터페이스 목록만 보인다")
    p.add_argument("--watch", action="store_true", help="꽂을 때마다 자동으로 한 판씩 잰다")
    p.add_argument("--vid", type=lambda s: int(s, 0), default=0)
    p.add_argument("--pid", type=lambda s: int(s, 0), default=0)
    p.add_argument("-n", type=int, default=1000, help="명령 회수")
    p.add_argument("--gap", type=float, default=1.0, help="명령 사이 쉬는 시간(ms), 0 이면 몰아친다")
    p.add_argument("--stop-after", type=int, default=0, help="오류 이 개수에서 멈춘다 (0=끝까지)")
    args = p.parse_args()

    if args.list:
        for d in hid.enumerate(args.vid, args.pid):
            print(
                f"{d['vendor_id']:#06x}:{d['product_id']:#06x} "
                f"usage={d.get('usage_page', 0):#06x}/{d.get('usage', 0):#04x} "
                f"if={d.get('interface_number')} {d.get('product_string')!r} {d['path']}"
            )
        return

    if args.watch:
        watch(args.vid, args.pid, args.n, args.gap, args.stop_after)
        return

    found = find(args.vid, args.pid)
    if not found:
        sys.exit("[E_] VIA 채널을 못 찾았다. --list 로 확인한다")
    if len(found) > 1:
        print(f"후보가 {len(found)}개다 — 첫째를 쓴다 (usage 정보 없는 platform)")
    target = found[0]
    print(
        f"{target['vendor_id']:#06x}:{target['product_id']:#06x} "
        f"{target.get('product_string')!r} 에 붙는다"
    )
    run_once(target, args.n, args.gap, args.stop_after)


if __name__ == "__main__":
    main()
