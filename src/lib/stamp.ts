/**
 * 고무 명판 인영 효과.
 *
 * 검게 그린 글자(알파 마스크)를 받아, 실제 고무인을 종이에 찍었을 때 생기는 흔적을 입힌다.
 *   ① 새김 윤곽   손으로 판 고무라 모서리가 둥글고 테두리가 낮은 주파수로 흔들린다
 *   ② 번짐        획이 조금 두꺼워지고 테두리가 종이 섬유를 따라 거칠게 퍼진다
 *   ③ 테두리 고임  잉크가 가장자리에 몰려 테두리는 진하고 획 속은 옅다
 *   ④ 압력 불균일  도장을 비스듬히 눌러 한쪽이 옅고 큰 얼룩이 진다
 *   ⑤ 흰 점        힘이 약한 곳에서 잉크가 덜 묻어 종이가 비친다
 *   ⑥ 종이 결      섬유 결이 비치고 잉크가 두꺼운 곳은 색이 더 진하다
 * 효과를 넣은 뒤에도 글자가 읽히도록 행마다 잉크가 남은 비율을 확인해 ④⑤를 누그러뜨린다.
 *
 * 모든 크기는 글자 크기 대비 비율이다. 칸마다 글자 크기가 다르므로(칸에 맞추느라 줄어든 글자 등)
 * 칸 영역별 기준 크기(unit)를 받아 효과 크기를 맞춘다. 해상도와 상관없이 같은 모양이 나온다.
 * 잡음은 시드로 고정해 같은 시드면 항상 같은 인영이 찍힌다.
 */

/** 인영 강도. 조절은 이 값들만 바꾸면 된다. 길이 단위는 행 높이 대비 비율. */
export type StampStyle = "rough" | "carved";

/** 거친 인영 — 테두리를 거의 이진화해 또렷하고 거칠게 */
export const STAMP = {
  // ① 새김 윤곽
  warpScale: 0.22, // 윤곽 흔들림의 물결 크기
  warpAmp: 0.014, // 윤곽이 밀리는 최대 거리
  roundRadius: 0.008, // 모서리를 둥글게 하는 블러 반경
  // ② 번짐
  spread: 0.46, // 0.5 보다 낮을수록 획이 두꺼워진다
  edgeRoughScale: 0.008, // 테두리 거칠기 결 크기
  edgeRough: 0.1, // 테두리 거칠기 세기
  // ③ 테두리 고임
  rimDecay: 0.02, // 테두리에서 속으로 옅어지는 거리
  rimInner: 0.72, // 획 속 농도 (테두리 = 1)
  // ④ 압력 불균일
  pressureMin: 0.5, // 가장 옅게 찍힌 곳의 농도
  blotScale: 0.9, // 얼룩 크기
  // ⑤ 흰 점
  voidScale: 0.008, // 흰 점 크기
  voidBase: 0.58, // 낮을수록 흰 점이 많다
  voidByPressure: 0.36, // 힘이 약한 곳일수록 흰 점이 늘어나는 정도
  voidAlpha: 0.1, // 흰 점에 남는 잉크
  // ⑥ 종이 결
  grainX: 0.004, // 결의 가로 크기 (가늘다)
  grainY: 0.04, // 결의 세로 크기 (길다)
  grain: 0.18, // 결의 세기
  darken: 0.3, // 잉크가 두꺼운 곳을 더 진하게
  edgeBand: 0.04, // 잉크 경계가 넘어가는 폭 (블러 값 기준). 좁으면 테두리가 계단처럼 보인다
  inkBoost: 1.2, // 전체 농도 보정
  // 가독성
  minLegible: 0.82, // 행마다 원래 글자 픽셀 중 잉크가 남아야 하는 비율
};

/**
 * 압력의 직선 기울기 비중. 도장을 비스듬히 눌러 명판 한쪽이 옅어지는 정도다.
 * 0.55 였을 때 명판 전체에 필터를 씌운 듯한 그라데이션이 생겨 절반으로 줄였다.
 * 평균 농도는 그대로 두고 양 끝의 차이만 줄어든다.
 */
const PRESS_RAMP = 0.275;

/* ---------- 시드 고정 난수와 Perlin 잡음 ---------- */

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

class Perlin {
  private perm = new Uint8Array(512);

  constructor(seed: number) {
    const rand = mulberry32(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i += 1) this.perm[i] = p[i & 255];
  }

  /** -1 ~ 1 */
  noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const dot = (h: number, dx: number, dy: number) => {
      const g = GRAD[h & 7];
      return g[0] * dx + g[1] * dy;
    };
    const p = this.perm;
    const n00 = dot(p[X + p[Y]], xf, yf);
    const n10 = dot(p[X + 1 + p[Y]], xf - 1, yf);
    const n01 = dot(p[X + p[Y + 1]], xf, yf - 1);
    const n11 = dot(p[X + 1 + p[Y + 1]], xf - 1, yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    const a = n00 + u * (n10 - n00);
    const b = n01 + u * (n11 - n01);
    return (a + v * (b - a)) * 1.414;
  }

  /** 여러 옥타브를 겹친 잡음, 0 ~ 1 */
  fbm(x: number, y: number, octaves: number, persistence = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o += 1) {
      sum += this.noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= persistence;
      freq *= 2;
    }
    return Math.min(1, Math.max(0, 0.5 + 0.5 * (sum / norm)));
  }
}

/* ---------- 래스터 도구 ---------- */

/** 성긴 격자에서 계산한 값을 픽셀로 보간한다. 느리게 변하는 잡음을 싸게 구할 때 쓴다. */
function coarseField(
  w: number,
  h: number,
  step: number,
  fn: (x: number, y: number) => number,
): Float32Array {
  const gw = Math.ceil(w / step) + 2;
  const gh = Math.ceil(h / step) + 2;
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) grid[gy * gw + gx] = fn(gx * step, gy * step);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const fy = y / step;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < w; x += 1) {
      const fx = x / step;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const i = y0 * gw + x0;
      const a = grid[i] + (grid[i + 1] - grid[i]) * tx;
      const b = grid[i + gw] + (grid[i + gw + 1] - grid[i + gw]) * tx;
      out[y * w + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function sample(src: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = src[y0 * w + x0] + (src[y0 * w + x1] - src[y0 * w + x0]) * tx;
  const b = src[y1 * w + x0] + (src[y1 * w + x1] - src[y1 * w + x0]) * tx;
  return a + (b - a) * ty;
}

/** 상자 블러 세 번 = 가우시안 근사 */
function blur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const a = src.slice();
  const b = new Float32Array(src.length);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const win = r * 2 + 1;
    for (let l = 0; l < lines; l += 1) {
      const idx = (k: number) => {
        const c = Math.min(len - 1, Math.max(0, k));
        return horizontal ? l * w + c : c * w + l;
      };
      let sum = 0;
      for (let k = -r; k <= r; k += 1) sum += from[idx(k)];
      for (let k = 0; k < len; k += 1) {
        to[idx(k)] = sum / win;
        sum += from[idx(k + r + 1)] - from[idx(k - r)];
      }
    }
  };
  for (let i = 0; i < 3; i += 1) {
    pass(a, b, true);
    pass(b, a, false);
  }
  return a;
}

/** 잉크 영역 안에서 가장 가까운 테두리까지의 거리(px). 3-4 챔퍼 2-패스. */
function distanceInside(mask: Float32Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i += 1) d[i] = mask[i] > 0.5 ? INF : 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 3);
        if (x > 0) v = Math.min(v, d[i - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 3);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + w - 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i += 1) d[i] /= 3;
  return d;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- 본체 ---------- */

/** 효과 크기의 기준이 달라지는 영역. 보통 칸 하나. */
export interface StampRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 이 영역의 기준 크기(px) */
  unit: number;
}

export interface StampOptions {
  /** 잉크 색 */
  color: string;
  /** 영역 밖에서 쓰는 기준 크기(px). 보통 행 높이 */
  unit: number;
  /** 칸별 기준 크기. 없으면 전체에 unit 을 쓴다 */
  regions?: StampRegion[];
  /** 행 수 (가독성 확인 단위) */
  rows: number;
  seed: number;
  /** 인영 스타일. 기본은 거친 인영 */
  style?: StampStyle;
}

/**
 * 캔버스에 검게 그려진 글자를 인영으로 바꿔 같은 캔버스에 다시 쓴다.
 * 결과는 잉크 색이 칠해진 투명 배경 이미지다.
 */
export function applyStamp(canvas: HTMLCanvasElement, opts: StampOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const u = opts.unit;
  if (opts.style === "carved") {
    applyCarved(canvas, opts);
    return;
  }
  const P = STAMP;
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  const src = new Float32Array(w * h);
  for (let i = 0; i < src.length; i += 1) src[i] = px[i * 4 + 3] / 255;

  // 픽셀마다 기준 크기. 칸 영역 안은 그 칸의 글자 크기를 따른다.
  const unitMap = new Float32Array(w * h).fill(u);
  const regions = opts.regions ?? [{ x0: 0, y0: 0, x1: w, y1: h, unit: u }];
  for (const r of regions) {
    const ya = Math.max(0, Math.floor(r.y0));
    const yb = Math.min(h, Math.ceil(r.y1));
    const xa = Math.max(0, Math.floor(r.x0));
    const xb = Math.min(w, Math.ceil(r.x1));
    for (let y = ya; y < yb; y += 1) unitMap.fill(r.unit, y * w + xa, y * w + xb);
  }

  const noiseWarpX = new Perlin(opts.seed);
  const noiseWarpY = new Perlin(opts.seed + 1);
  const noiseEdge = new Perlin(opts.seed + 2);
  const noiseBlot = new Perlin(opts.seed + 3);
  const noiseVoid = new Perlin(opts.seed + 4);
  const noiseGrain = new Perlin(opts.seed + 5);
  const rand = mulberry32(opts.seed + 6);

  // ① 윤곽 흔들림: 성긴 격자의 잡음으로 픽셀을 밀어 테두리를 부드럽게 휘게 한다.
  // 물결 크기는 전체 공통, 밀리는 거리는 칸의 글자 크기에 비례.
  const ws = S(P.warpScale, u);
  const step = Math.max(2, Math.round(ws / 6));
  const dx = coarseField(w, h, step, (x, y) => (noiseWarpX.fbm(x / ws, y / ws, 2) - 0.5) * 2);
  const dy = coarseField(w, h, step, (x, y) => (noiseWarpY.fbm(x / ws, y / ws, 2) - 0.5) * 2);
  const warped = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const amp = P.warpAmp * unitMap[i];
      warped[i] = sample(src, w, h, x + dx[i] * amp, y + dy[i] * amp);
    }
  }

  // ① 모서리 둥글게 + ② 번짐: 블러 뒤 0.5 보다 낮은 문턱으로 다시 잘라 획을 두껍게 하고,
  // 문턱을 고주파 잡음으로 흔들어 테두리를 섬유처럼 거칠게 만든다.
  // 블러 반경은 칸마다 달라서 칸 영역을 잘라 따로 블러한다.
  const blurRegions = (field: Float32Array, ratio: number) => {
    const outField = field.slice();
    for (const r of regions) {
      const xa = Math.max(0, Math.floor(r.x0));
      const ya = Math.max(0, Math.floor(r.y0));
      const rw = Math.min(w, Math.ceil(r.x1)) - xa;
      const rh = Math.min(h, Math.ceil(r.y1)) - ya;
      if (rw <= 2 || rh <= 2) continue;
      const part = new Float32Array(rw * rh);
      for (let y = 0; y < rh; y += 1) {
        part.set(field.subarray((ya + y) * w + xa, (ya + y) * w + xa + rw), y * rw);
      }
      const b = blur(part, rw, rh, ratio * r.unit);
      for (let y = 0; y < rh; y += 1) outField.set(b.subarray(y * rw, y * rw + rw), (ya + y) * w + xa);
    }
    return outField;
  };
  const blurred = blurRegions(warped, P.roundRadius);
  const mask = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const b = blurred[i];
      if (b < 0.03) continue;
      const es = S(P.edgeRoughScale, unitMap[i]);
      const t = P.spread + P.edgeRough * (noiseEdge.fbm(x / es, y / es, 3) - 0.5) * 2;
      mask[i] = smoothstep(t - P.edgeBand, t + P.edgeBand, b);
    }
  }
  // ③ 테두리 고임: 테두리에서 멀어질수록 옅게.
  const dist = distanceInside(mask, w, h);

  // ④ 압력: 무작위 방향의 기울기 + 큰 얼룩.
  const angle = rand() * Math.PI * 2;
  const gx = Math.cos(angle);
  const gy = Math.sin(angle);
  const half = Math.hypot(w, h) / 2;
  const bs = S(P.blotScale, u);
  const pressureRaw = coarseField(w, h, Math.max(4, Math.round(bs / 8)), (x, y) => {
    const ramp = 0.5 + 0.5 * (((x - w / 2) * gx + (y - h / 2) * gy) / half);
    return 0.275 + PRESS_RAMP * (ramp - 0.5) + 0.45 * noiseBlot.fbm(x / bs, y / bs, 3);
  });

  const rowH = h / opts.rows;

  // 행마다 글자가 충분히 남을 때까지 ④⑤ 를 누그러뜨리며 다시 계산한다.
  let out = new Float32Array(w * h);
  for (let k = 1; k >= 0; k -= 0.25) {
    out = new Float32Array(w * h);
    const pMin = 1 - (1 - P.pressureMin) * k;
    const legible = new Float64Array(opts.rows);
    const original = new Float64Array(opts.rows);
    for (let y = 0; y < h; y += 1) {
      const row = Math.min(opts.rows - 1, Math.floor(y / rowH));
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (src[i] > 0.5) original[row] += 1;
        const m = mask[i];
        if (m <= 0) continue;
        const ui = unitMap[i];
        const rim =
          P.rimInner + (1 - P.rimInner) * Math.exp(-dist[i] / (P.rimDecay * ui));
        const pressure = pMin + (1 - pMin) * Math.min(1, Math.max(0, pressureRaw[i]));
        // ⑤ 흰 점: 힘이 약한 곳일수록 문턱이 낮아져 구멍이 많아진다.
        const threshold = P.voidBase + P.voidByPressure * pressure + (1 - k) * 0.4;
        const vs = S(P.voidScale, ui);
        const vn = noiseVoid.fbm(x / vs, y / vs, 3);
        const hole = vn > threshold ? P.voidAlpha : 1;
        // ⑥ 종이 결
        const grain =
          1 - P.grain * noiseGrain.fbm(x / S(P.grainX, ui), y / S(P.grainY, ui), 2);
        const a = Math.min(1, m * rim * pressure * hole * grain * P.inkBoost);
        out[i] = a;
        if (src[i] > 0.5 && a > 0.25) legible[row] += 1;
      }
    }
    let ok = true;
    for (let r = 0; r < opts.rows; r += 1) {
      if (original[r] > 0 && legible[r] / original[r] < P.minLegible) ok = false;
    }
    if (ok) break;
  }

  // 색: 잉크가 두꺼운 곳(테두리 고임·센 압력)은 조금 더 진하게.
  const [cr, cg, cb] = hexToRgb(opts.color);
  for (let i = 0; i < out.length; i += 1) {
    const a = out[i];
    const j = i * 4;
    if (a <= 0) {
      px[j + 3] = 0;
      continue;
    }
    const shade = 1 + P.darken * (0.55 - Math.min(1, a / Math.max(mask[i], 1e-3)));
    px[j] = Math.min(255, cr * shade);
    px[j + 1] = Math.min(255, cg * shade);
    px[j + 2] = Math.min(255, cb * shade);
    px[j + 3] = Math.round(Math.min(1, a) * 255);
  }
  ctx.putImageData(image, 0, 0);
}

/** 행 높이 대비 비율을 px 로. 잡음 좌표를 나눌 때 0 이 되지 않게 최소 1px. */
function S(ratio: number, unit: number): number {
  return Math.max(1, ratio * unit);
}

/* ======================================================================
 * 새김 인영 — 거리장(SDF) 방식
 *
 * 글자를 2배 해상도로 올려 모든 픽셀에서 테두리까지의 부호 있는 거리를 구하고,
 * 도장 효과(요철·두께·섬유)를 픽셀이 아니라 이 거리값을 흔들어 넣는다.
 * 마지막에 경계를 정확히 1px 폭으로만 넘기고 원래 크기로 줄여서
 * 문턱으로 자른 계단도, 블러로 푼 흐림도 생기지 않는다.
 * ==================================================================== */

/** 새김 인영 강도. 길이 단위는 행 높이 대비 비율 */
export const CARVED = {
  scale: 2, // 거리장을 계산하는 배율
  grow: 0, // 획이 두꺼워지는 정도. 0 이면 원래 폰트 굵기 그대로 (면적 비 약 1.00)
  wobbleScale: 0.18, // 새김 윤곽이 크게 휘는 물결 크기
  wobbleAmp: 0.005,
  rippleScale: 0.04, // 잔물결
  rippleAmp: 0.002,
  fiberScale: 0.01, // 테두리의 섬유 요철 (선명하게 남는다)
  fiberAmp: 0.003,
  rimDecay: 0.025, // 테두리에서 속으로 옅어지는 거리
  rimInner: 0.7,
  pressureMin: 0.5,
  blotScale: 0.9,
  voidScale: 0.028, // 흰 점 크기
  voidBase: 0.62,
  voidByPressure: 0.3,
  voidAlpha: 0.12,
  voidEdge: 0.06, // 흰 점 가장자리 폭 (잡음 값 기준)
  grainX: 0.006,
  grainY: 0.05,
  grain: 0.12,
  darken: 0.3,
  inkBoost: 1.25,
  minLegible: 0.82,
};

/** Felzenszwalb 1D 제곱 거리 변환 */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q += 1) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k -= 1;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** feature 가 1 인 픽셀까지의 정확한 유클리드 거리 */
function distanceTo(feature: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float32Array(w * h);
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) f[y] = feature[y * w + x] ? 0 : INF;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y += 1) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x += 1) g[y * w + x] = Math.sqrt(d[x]);
  }
  return g;
}

function applyCarved(canvas: HTMLCanvasElement, opts: StampOptions): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const P = CARVED;
  const { width: w, height: h } = canvas;
  const u = opts.unit;
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  const src = new Float32Array(w * h);
  for (let i = 0; i < src.length; i += 1) src[i] = px[i * 4 + 3] / 255;

  const unitMap = new Float32Array(w * h).fill(u);
  for (const r of opts.regions ?? []) {
    const ya = Math.max(0, Math.floor(r.y0));
    const yb = Math.min(h, Math.ceil(r.y1));
    const xa = Math.max(0, Math.floor(r.x0));
    const xb = Math.min(w, Math.ceil(r.x1));
    for (let y = ya; y < yb; y += 1) unitMap.fill(r.unit, y * w + xa, y * w + xb);
  }

  // 1. 2배 해상도에서 글자 안/밖을 나누고 부호 있는 거리를 구한다.
  const s = P.scale;
  const W = w * s;
  const H = h * s;
  const inside = new Uint8Array(W * H);
  const outside = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const on = sample(src, w, h, (x + 0.5) / s - 0.5, (y + 0.5) / s - 0.5) > 0.5;
      inside[y * W + x] = on ? 1 : 0;
      outside[y * W + x] = on ? 0 : 1;
    }
  }
  const toInk = distanceTo(inside, W, H); // 밖 → 잉크까지
  const toPaper = distanceTo(outside, W, H); // 안 → 종이까지

  // 2. 거리값을 흔들어 새김 모양을 만든다 (단위: 2배 해상도 px).
  const nWob = new Perlin(opts.seed + 11);
  const nRip = new Perlin(opts.seed + 12);
  const nFib = new Perlin(opts.seed + 13);
  const wob = S(P.wobbleScale, u) * s;
  const rip = S(P.rippleScale, u) * s;
  const low = coarseField(W, H, Math.max(2, Math.round(rip / 4)), (x, y) => {
    return (nWob.fbm(x / wob, y / wob, 2) - 0.5) * 2 * P.wobbleAmp +
      (nRip.fbm(x / rip, y / rip, 2) - 0.5) * 2 * P.rippleAmp;
  });

  const shapeHi = new Float32Array(W * H);
  const depthHi = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const sy = Math.min(h - 1, Math.floor(y / s));
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const un = unitMap[sy * w + Math.min(w - 1, Math.floor(x / s))] * s;
      let sd = inside[i] ? -(toPaper[i] - 0.5) : toInk[i] - 0.5;
      // 경계 근처만 잔 섬유 요철을 계산한다 (멀리선 결과에 영향이 없다).
      const reach = (P.grow + P.wobbleAmp + P.rippleAmp + P.fiberAmp) * un + s * 2;
      if (sd > reach) continue;
      sd -= P.grow * un;
      sd += low[i] * un;
      if (Math.abs(sd) < P.fiberAmp * un + s * 2) {
        const fs = Math.max(1, P.fiberScale * un);
        sd += (nFib.fbm(x / fs, y / fs, 2) - 0.5) * 2 * P.fiberAmp * un;
      }
      // 경계를 최종 해상도 기준 정확히 1px 폭으로만 넘긴다.
      shapeHi[i] = 1 - smoothstep(-s / 2, s / 2, sd);
      depthHi[i] = Math.max(0, -sd) / s;
    }
  }

  // 3. 원래 크기로 줄인다 (s×s 평균 → 안티에일리어싱).
  const shape = new Float32Array(w * h);
  const depth = new Float32Array(w * h);
  const inv = 1 / (s * s);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let a = 0;
      let dsum = 0;
      for (let yy = 0; yy < s; yy += 1) {
        const row = (y * s + yy) * W + x * s;
        for (let xx = 0; xx < s; xx += 1) {
          a += shapeHi[row + xx];
          dsum += depthHi[row + xx];
        }
      }
      shape[y * w + x] = a * inv;
      depth[y * w + x] = dsum * inv;
    }
  }

  // 4. 잉크: 테두리 고임 · 압력 · 흰 점 · 종이 결.
  const rand = mulberry32(opts.seed + 16);
  const nBlot = new Perlin(opts.seed + 14);
  const nVoid = new Perlin(opts.seed + 15);
  const nGrain = new Perlin(opts.seed + 17);
  const angle = rand() * Math.PI * 2;
  const gx = Math.cos(angle);
  const gy = Math.sin(angle);
  const half = Math.hypot(w, h) / 2;
  const bs = S(P.blotScale, u);
  const pressureRaw = coarseField(w, h, Math.max(4, Math.round(bs / 8)), (x, y) => {
    const ramp = 0.5 + 0.5 * (((x - w / 2) * gx + (y - h / 2) * gy) / half);
    return 0.275 + PRESS_RAMP * (ramp - 0.5) + 0.45 * nBlot.fbm(x / bs, y / bs, 3);
  });

  const rowH = h / opts.rows;
  let out = new Float32Array(w * h);
  for (let k = 1; k >= 0; k -= 0.25) {
    out = new Float32Array(w * h);
    const pMin = 1 - (1 - P.pressureMin) * k;
    const legible = new Float64Array(opts.rows);
    const original = new Float64Array(opts.rows);
    for (let y = 0; y < h; y += 1) {
      const row = Math.min(opts.rows - 1, Math.floor(y / rowH));
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (src[i] > 0.5) original[row] += 1;
        const m = shape[i];
        if (m <= 0) continue;
        const ui = unitMap[i];
        const rim = P.rimInner + (1 - P.rimInner) * Math.exp(-depth[i] / (P.rimDecay * ui));
        const pressure = pMin + (1 - pMin) * Math.min(1, Math.max(0, pressureRaw[i]));
        const th = P.voidBase + P.voidByPressure * pressure + (1 - k) * 0.4;
        const vs = S(P.voidScale, ui);
        const vn = nVoid.fbm(x / vs, y / vs, 3);
        const hole = 1 - (1 - P.voidAlpha) * smoothstep(th, th + P.voidEdge, vn);
        const grain =
          1 - P.grain * nGrain.fbm(x / S(P.grainX, ui), y / S(P.grainY, ui), 2);
        const a = Math.min(1, m * rim * pressure * hole * grain * P.inkBoost);
        out[i] = a;
        if (src[i] > 0.5 && a > 0.25) legible[row] += 1;
      }
    }
    let ok = true;
    for (let r = 0; r < opts.rows; r += 1) {
      if (original[r] > 0 && legible[r] / original[r] < P.minLegible) ok = false;
    }
    if (ok) break;
  }

  const [cr, cg, cb] = hexToRgb(opts.color);
  for (let i = 0; i < out.length; i += 1) {
    const a = out[i];
    const j = i * 4;
    if (a <= 0) {
      px[j + 3] = 0;
      continue;
    }
    const shade = 1 + P.darken * (0.55 - Math.min(1, a / Math.max(shape[i], 1e-3)));
    px[j] = Math.min(255, cr * shade);
    px[j + 1] = Math.min(255, cg * shade);
    px[j + 2] = Math.min(255, cb * shade);
    px[j + 3] = Math.round(Math.min(1, a) * 255);
  }
  ctx.putImageData(image, 0, 0);
}
