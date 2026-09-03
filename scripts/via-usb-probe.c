/*
 * VIA 채널(0xFF60) OUT 엔드포인트 고장 진단 — 리눅스/libusb.
 *
 * HID 드라이버를 떼고 인터럽트 엔드포인트를 직접 두드린다. macOS 로는 못 하는
 * 세 가지를 여기서 한다:
 *
 *   1. 시간 제한을 우리가 정한다 (macOS 는 SetReport 가 5초 고정이라 실패마다
 *      5초를 태운다. 여기선 200ms 다)
 *   2. 실패 사유가 갈린다 — TIMEOUT(NAK) / PIPE(STALL) / IO(버스 오류) / NO_DEVICE.
 *      macOS 는 이걸 전부 kIOReturnTimeout 하나로 뭉갠다
 *   3. 굳었을 때 CLEAR_FEATURE(ENDPOINT_HALT) 와 포트 리셋을 직접 걸어본다
 *
 * 3번이 핵심이다. 되살아나는지 아닌지가 원인을 가른다.
 *
 * ★ 실제로 잰 보드(28E9:CB60)에서는 이렇게 나왔다: 오류가 항상 TIMEOUT 이고,
 *   방향은 항상 OUT 이고, clear_halt(OUT) 로 매번 되살아났다. 즉 엔드포인트가
 *   NAK 인 채로 남는 것이다 — halt 도 버스 오류도 아니다.
 *
 * 출력이 영어인 것은 이 도구를 보드 만든 쪽에 그대로 넘기기 때문이다.
 *
 * 빌드:  gcc -O2 -o via-usb-probe via-usb-probe.c -lusb-1.0
 * 실행:  sudo ./via-usb-probe --vid 0x28E9 --pid 0xCB60
 *
 *   --rounds N   판 수          --gap-us N  명령 사이 쉬는 시간 (경합인지 본다)
 *   -n N         판당 명령 수   --only 0x01 한 가지 명령만 (처리기별로 가른다)
 *   --info       서술자만 찍고 끝낸다
 */
#include <libusb-1.0/libusb.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define REPORT_LEN 32
#define XFER_TIMEOUT_MS 200

static int vid = 0x28E9, pid = 0xCB60;
static int rounds = 20, per_round = 20000, want_info = 0;
static int only_cmd = 0;  /* 한 가지 명령만 두드려서 어느 처리기가 문제인지 가른다 */
static long gap_us = 0;   /* 명령 사이 쉬는 시간 — 경합인지 보려면 이걸 늘린다 */

static uint8_t ep_out, ep_in;
static const char *last_dir = "?";  /* 어느 방향에서 막혔나 */
static int iface = -1;

static double now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
}

/* 인터럽트 엔드포인트 한 쌍(IN/OUT)을 가진 HID 인터페이스를 찾는다 = VIA 채널 */
static int find_iface(libusb_device *dev) {
    struct libusb_config_descriptor *cfg;
    if (libusb_get_active_config_descriptor(dev, &cfg) != 0) return -1;

    int found = -1;
    for (int i = 0; i < cfg->bNumInterfaces; i++) {
        const struct libusb_interface_descriptor *d = &cfg->interface[i].altsetting[0];
        uint8_t in = 0, out = 0;
        printf("  interface %d  class=%d  endpoints=%d\n",
               d->bInterfaceNumber, d->bInterfaceClass, d->bNumEndpoints);
        for (int e = 0; e < d->bNumEndpoints; e++) {
            const struct libusb_endpoint_descriptor *ep = &d->endpoint[e];
            printf("    ep 0x%02x  %s  maxpacket=%u  bInterval=%u\n",
                   ep->bEndpointAddress,
                   (ep->bEndpointAddress & 0x80) ? "IN " : "OUT",
                   ep->wMaxPacketSize, ep->bInterval);
            if (ep->bEndpointAddress & 0x80) in = ep->bEndpointAddress;
            else out = ep->bEndpointAddress;
        }
        /* VIA 채널은 IN 과 OUT 을 둘 다 가진다. 키보드 인터페이스는 IN 뿐이다. */
        if (in && out && found < 0) {
            found = d->bInterfaceNumber;
            ep_in = in;
            ep_out = out;
        }
    }
    libusb_free_config_descriptor(cfg);
    return found;
}

/* 명령 하나. 0 이면 성공, 아니면 libusb 오류코드 */
static int one(libusb_device_handle *h, uint8_t cmd, const uint8_t *args, int nargs) {
    uint8_t tx[REPORT_LEN] = {0}, rx[REPORT_LEN] = {0};
    int n = 0, rc;

    tx[0] = cmd;
    if (nargs) memcpy(tx + 1, args, nargs);

    rc = libusb_interrupt_transfer(h, ep_out, tx, REPORT_LEN, &n, XFER_TIMEOUT_MS);
    if (rc != 0) { last_dir = "OUT"; return rc; }

    rc = libusb_interrupt_transfer(h, ep_in, rx, REPORT_LEN, &n, XFER_TIMEOUT_MS);
    if (rc != 0) { last_dir = "IN"; return rc; }

    if (memcmp(tx, rx, 1 + nargs) != 0) return LIBUSB_ERROR_OTHER; /* 짝이 안 맞음 */
    return 0;
}

/* 붙을 때의 부하를 흉내낸다 — 키맵 버퍼 읽기가 회수로 압도적이다 */
static int step(libusb_device_handle *h, long i) {
    if (only_cmd) {
        if (only_cmd == 0x12) {
            int off = (i % 8) * 28;
            uint8_t a[3] = {(off >> 8) & 0xFF, off & 0xFF, 28};
            return one(h, 0x12, a, 3);
        }
        return one(h, (uint8_t)only_cmd, NULL, 0);
    }
    int slot = i % 10;
    if (slot == 0) return one(h, 0x01, NULL, 0);        /* GET_PROTOCOL_VERSION */
    if (slot == 1) return one(h, 0x11, NULL, 0);        /* GET_LAYER_COUNT */
    int off = (slot - 2) * 28;
    uint8_t a[3] = {(off >> 8) & 0xFF, off & 0xFF, 28};
    return one(h, 0x12, a, 3);                          /* GET_BUFFER */
}

/* 굳었을 때 되살릴 수 있는지 사다리를 타 본다 */
static const char *revive(libusb_device_handle *h) {
    if (libusb_clear_halt(h, ep_out) == 0 && step(h, 0) == 0) return "cleared by clear_halt(OUT)";
    if (libusb_clear_halt(h, ep_in) == 0 && step(h, 0) == 0) return "cleared by clear_halt(IN)";
    if (libusb_reset_device(h) == 0) {
        libusb_claim_interface(h, iface);
        if (step(h, 0) == 0) return "cleared by port reset";
    }
    return "not cleared by any recovery (replug required)";
}

int main(int argc, char **argv) {
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--vid")) vid = strtol(argv[++i], NULL, 0);
        else if (!strcmp(argv[i], "--pid")) pid = strtol(argv[++i], NULL, 0);
        else if (!strcmp(argv[i], "--rounds")) rounds = atoi(argv[++i]);
        else if (!strcmp(argv[i], "-n")) per_round = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--info")) want_info = 1;
        else if (!strcmp(argv[i], "--gap-us")) gap_us = atol(argv[++i]);
        else if (!strcmp(argv[i], "--only")) only_cmd = strtol(argv[++i], NULL, 0);
    }

    libusb_init(NULL);
    libusb_device_handle *h = libusb_open_device_with_vid_pid(NULL, vid, pid);
    if (!h) {
        fprintf(stderr, "[E_] cannot open %04x:%04x (run with sudo?)\n", vid, pid);
        return 1;
    }

    printf("%04x:%04x descriptors\n", vid, pid);
    iface = find_iface(libusb_get_device(h));
    if (iface < 0) {
        fprintf(stderr, "[E_] no interface with both an IN and an OUT endpoint\n");
        return 1;
    }
    printf("\nVIA channel: interface %d, OUT 0x%02x, IN 0x%02x\n", iface, ep_out, ep_in);
    if (want_info) return 0;

    libusb_set_auto_detach_kernel_driver(h, 1);
    if (libusb_claim_interface(h, iface) != 0) {
        fprintf(stderr, "[E_] cannot claim the interface\n");
        return 1;
    }

    long survived[256];
    int nbreak = 0;
    for (int r = 0; r < rounds; r++) {
        double t0 = now_ms();
        long i = 0;
        int rc = 0;
        for (; i < per_round; i++) {
            rc = step(h, i);
            if (rc != 0) break;
            if (gap_us) { struct timespec ts = {gap_us / 1000000, (gap_us % 1000000) * 1000}; nanosleep(&ts, NULL); }
        }
        if (rc == 0) {
            printf("%2d: %ld transfers, no wedge (%.1f s)\n", r + 1, i, (now_ms() - t0) / 1000);
            continue;
        }
        printf("%2d: wedged after %4ld transfers \u2014 %s / %s\n",
               r + 1, i, libusb_error_name(rc), last_dir);
        if (nbreak < 256) survived[nbreak++] = i;
        printf("    recovery: %s\n", revive(h));
        if (rc == LIBUSB_ERROR_NO_DEVICE) {
            printf("    device is gone \u2014 stopping here\n");
            break;
        }
    }

    if (nbreak) {
        long lo = survived[0], hi = survived[0], sum = 0;
        for (int i = 0; i < nbreak; i++) {
            if (survived[i] < lo) lo = survived[i];
            if (survived[i] > hi) hi = survived[i];
            sum += survived[i];
        }
        printf("\n%d wedges \u2014 survived min %ld, max %ld, mean %ld\n",
               nbreak, lo, hi, sum / nbreak);
    }

    libusb_release_interface(h, iface);
    libusb_close(h);
    libusb_exit(NULL);
    return 0;
}
