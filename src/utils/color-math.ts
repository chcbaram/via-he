import {THEMES} from 'src/utils/themes';

export const updateCSSVariables = (themeName: keyof typeof THEMES) => {
  const selectedTheme = THEMES[themeName] || THEMES['OLIVIA_DARK'];

  document.documentElement.style.setProperty(
    '--color_accent',
    selectedTheme.accent.c,
  );
  document.documentElement.style.setProperty(
    '--color_inside-accent',
    selectedTheme.accent.t,
  );
};

export const getRandomColor = () =>
  Array(3)
    .fill(0)
    .reduce(
      (a) => `${a}${(~~(Math.random() * 255)).toString(16).padStart(2, '0')}`,
      '#',
    );

export function getRGBPrime(
  hue: number,
  c: number,
  x: number,
): [number, number, number] {
  if (hue >= 0 && hue < 60) {
    return [c, x, 0];
  } else if (hue >= 60 && hue < 120) {
    return [x, c, 0];
  } else if (hue >= 120 && hue < 180) {
    return [0, c, x];
  } else if (hue >= 180 && hue < 240) {
    return [0, x, c];
  } else if (hue >= 240 && hue < 300) {
    return [x, 0, c];
  } else if (hue >= 300 && hue < 360) {
    return [c, 0, x];
  } else if (hue === 360) {
    return [c, x, 0];
  }
  throw new Error('Invalid hue');
}

export const getBrightenedColor = (color: string, multiplier = 0.8) => {
  const cleanedColor = color.replace('#', '');
  const r = parseInt(cleanedColor[0], 16) * 16 + parseInt(cleanedColor[1], 16);
  const g = parseInt(cleanedColor[2], 16) * 16 + parseInt(cleanedColor[3], 16);
  const b = parseInt(cleanedColor[4], 16) * 16 + parseInt(cleanedColor[5], 16);
  const hr = Math.min(Math.round(r / multiplier), 256).toString(16);
  const hg = Math.min(Math.round(g / multiplier), 256).toString(16);
  const hb = Math.min(Math.round(b / multiplier), 256).toString(16);
  const res = `#${hr.padStart(2, '0')}${hg.padStart(2, '0')}${hb.padStart(
    2,
    '0',
  )}`;
  return res;
};

export const getColorByte = (color: string) => {
  const cleanedColor = color.replace('#', '');
  const r = parseInt(cleanedColor[0], 16) * 16 + parseInt(cleanedColor[1], 16);
  const g = parseInt(cleanedColor[2], 16) * 16 + parseInt(cleanedColor[3], 16);
  const b = parseInt(cleanedColor[4], 16) * 16 + parseInt(cleanedColor[5], 16);
  return [r, g, b];
};

/*
 * 실시간 표시(깊이·원시값)의 색.
 *
 * ★ 키캡 색에 따라 두 가지 파랑 중에 고른다.
 *
 *   하나로 박아 두면 반드시 한쪽에서 안 보인다. 밝은 파랑은 어두운 기본 키캡에서
 *   잘 보이지만, 고른 키는 키캡이 밝은 강조색으로 바뀌어 그 위에서 묻는다.
 *   실제로 고른 키에서만 숫자가 안 보였다.
 *
 *   밝기로 갈라 어두운 키캡에는 밝은 파랑, 밝은 키캡에는 진한 파랑을 준다. 파랑을
 *   유지하는 것은 "지금 이 순간" 표시라는 뜻이 색에 실려 있기 때문이다 — 검정으로
 *   바꾸면 그 키에서만 설정값과 같은 부류로 읽힌다.
 *
 *   0.6 은 sRGB 밝기 기준이다 (사람 눈이 초록에 가장 민감하다).
 */
export const LIVE_COLOR_ON_DARK = '#4da3ff';
export const LIVE_COLOR_ON_LIGHT = '#0b4da2';

export const getLiveColor = (bg: string) => {
  try {
    const [r, g, b] = getColorByte(bg);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? LIVE_COLOR_ON_LIGHT : LIVE_COLOR_ON_DARK;
  } catch {
    return LIVE_COLOR_ON_DARK;
  }
};

export const getDarkenedColor = (color: string, multiplier = 0.8) => {
  const [r, g, b] = getColorByte(color);
  const hr = Math.round(r * multiplier).toString(16);
  const hg = Math.round(g * multiplier).toString(16);
  const hb = Math.round(b * multiplier).toString(16);
  const res = `#${hr.padStart(2, '0')}${hg.padStart(2, '0')}${hb.padStart(
    2,
    '0',
  )}`;
  return res;
};

export const get256HSV = (color: string) => {
  const [h, s, v] = getHSV(color);
  return [
    Math.round((255 * h) / 360),
    Math.round(255 * s),
    Math.round(255 * v),
  ];
};
export const getHSV = (color: string) => {
  const [rPrime, gPrime, bPrime] = getColorByte(color).map((c) => c / 255);
  const [cmax, cmin] = [
    Math.max(rPrime, gPrime, bPrime),
    Math.min(rPrime, gPrime, bPrime),
  ];
  const delta = cmax - cmin;
  let h = 60;
  let s = 0;
  let v = cmax;
  if (delta === 0) {
    h = h * 0;
  } else if (cmax === rPrime) {
    h = h * (((gPrime - bPrime) / delta) % 6);
  } else if (cmax === gPrime) {
    h = h * ((bPrime - rPrime) / delta + 2);
  } else if (cmax === bPrime) {
    h = h * ((rPrime - gPrime) / delta + 4);
  }
  if (cmax !== 0) {
    s = delta / cmax;
  }
  return [(h + 360) % 360, s, v];
};
export const getHSVFrom256 = (color: number[]) => {
  return [Math.round((360 * color[0]) / 255), Math.round(color[1] / 255), 1];
};

export function getRGB({hue, sat}: {hue: number; sat: number}): string {
  sat = sat / 255;
  hue = Math.round(360 * hue) / 255;
  const c = sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 1 - c;
  const [r, g, b] = getRGBPrime(hue, c, x).map((n) =>
    Math.round(255 * (m + n)),
  );
  return `rgba(${r},${g},${b},1)`;
}

export function toDegrees(rad: number): number {
  return rad * (180 / Math.PI);
}

export function calcRadialHue(x: number, y: number) {
  if (x < 200 && y < 200) {
    const nX = 200 - x;
    const nY = 200 - y;
    return 2 * Math.PI - Math.atan(nX / nY);
  } else if (x > 200 && y < 200) {
    const nX = x - 200;
    const nY = 200 - y;
    return Math.atan(nX / nY);
  } else if (x < 200 && y > 200) {
    const nX = 200 - x;
    const nY = y - 200;
    return Math.PI + Math.atan(nX / nY);
  } else if (x > 200 && y > 200) {
    const nX = x - 200;
    const nY = y - 200;
    return 0.5 * Math.PI + Math.atan(nY / nX);
  } else if (x === 200) {
    return y > 200 ? Math.PI : 0;
  } else if (y === 200) {
    return x >= 200 ? 0.5 * Math.PI : 1.5 * Math.PI;
  }
}

export function calcRadialMagnitude(x: number, y: number) {
  if (x < 200 && y < 200) {
    const nX = 200 - x;
    const nY = 200 - y;
    return Math.sqrt(nX * nX + nY * nY) / 200;
  } else if (x > 200 && y < 200) {
    const nX = x - 200;
    const nY = 200 - y;
    return Math.sqrt(nX * nX + nY * nY) / 200;
  } else if (x < 200 && y > 200) {
    const nX = 200 - x;
    const nY = y - 200;
    return Math.sqrt(nX * nX + nY * nY) / 200;
  } else if (x > 200 && y > 200) {
    const nX = x - 200;
    const nY = y - 200;
    return Math.sqrt(nX * nX + nY * nY) / 200;
  } else if (x === 200) {
    return y > 200 ? (y - 200) / 200 : (200 - y) / 200;
  } else if (y === 200) {
    return x > 200 ? (x - 200) / 200 : (200 - x) / 200;
  }
}

export function hsToRgb({hue, sat}: {hue: number; sat: number}) {
  sat = sat / 255;
  hue = Math.round(360 * hue) / 255;
  const c = sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 1 - c;
  const [r, g, b] = getRGBPrime(hue, c, x).map((n) =>
    Math.round(255 * (m + n)),
  );

  return [r, g, b];
}

export function getHex({hue, sat}: {hue: number; sat: number}) {
  let [r, g, b] = hsToRgb({hue, sat}).map((x) => x.toString(16));
  if (r.length == 1) r = '0' + r;
  if (g.length == 1) g = '0' + g;
  if (b.length == 1) b = '0' + b;
  return '#' + r + g + b;
}
