/**
 * 글자를 칸 폭에 맞추는 규칙.
 *
 * 칸보다 글이 길면 다음 순서로 줄인다. 앞 단계가 한계에 닿았을 때만 다음 단계로 넘어간다.
 *   1. 자간을 좁힌다 (최소 자간까지)
 *   2. 장평(글자 폭)을 줄인다 (최소 장평까지)
 *   3. 그래도 넘치면 그때 글자 크기를 줄인다
 * 칸보다 짧으면 크기는 그대로 두고, 양쪽 정렬 칸만 자간을 벌려 폭을 채운다.
 * 원하는 자간(preferredTracking)이 있으면 그 간격부터 먼저 줄인 뒤 위 순서를 밟는다.
 */

export interface FitLimits {
  /** 허용하는 가장 좁은 자간. 글자 크기 대비 비율이며 음수면 글자끼리 붙인다. */
  minTracking: number;
  /** 허용하는 가장 좁은 장평 (1 = 원래 폭) */
  minScaleX: number;
}

/** wrap 은 렌더러가 두 줄로 나눴을 때 붙인다. */
export type FitStage = "fits" | "tracking" | "scaleX" | "size" | "wrap";

export interface Fit {
  /** 최종 글자 크기(px) */
  size: number;
  /** 글자 사이 간격(px) */
  tracking: number;
  /** 가로 배율 */
  scaleX: number;
  /** 어느 단계에서 맞춰졌는지 */
  stage: FitStage;
}

/**
 * @param unitWidths 글자 크기 1px 일 때 각 글자의 폭
 * @param maxWidth 칸의 가용 폭(px)
 * @param baseSize 기본 글자 크기(px)
 * @param justify 짧을 때 자간을 벌려 폭을 채울지
 * @param preferredTracking 여유가 있을 때 쓸 자간 (글자 크기 대비)
 */
export function fitText(
  unitWidths: number[],
  maxWidth: number,
  baseSize: number,
  limits: FitLimits,
  justify: boolean,
  preferredTracking = 0,
  fixedMask?: boolean[],
): Fit {
  const n = unitWidths.length;
  if (n === 0 || maxWidth <= 0) return { size: baseSize, tracking: 0, scaleX: 1, stage: "fits" };

  // 띄어쓰기는 장평으로 줄이지 않는다. 줄이면 단어 경계가 사라진다.
  const fixed = sumWidths(unitWidths, fixedMask, true);
  const scalable = sumWidths(unitWidths, fixedMask, false);
  const unit = fixed + scalable;
  const gaps = n - 1;
  const natural = unit * baseSize;

  const preferredPx = gaps > 0 ? preferredTracking * baseSize : 0;
  if (natural + preferredPx * gaps <= maxWidth) {
    const tracking = justify && gaps > 0 ? (maxWidth - natural) / gaps : preferredPx;
    return { size: baseSize, tracking, scaleX: 1, stage: "fits" };
  }

  // 1. 자간
  const minTrackingPx = limits.minTracking * baseSize;
  if (gaps > 0) {
    const tracking = (maxWidth - natural) / gaps;
    if (tracking >= minTrackingPx) return { size: baseSize, tracking, scaleX: 1, stage: "tracking" };
  }
  const trackingUsed = gaps > 0 ? minTrackingPx : 0;

  // 2. 장평
  const scaleX = (maxWidth - trackingUsed * gaps - fixed * baseSize) / (scalable * baseSize);
  if (scaleX >= limits.minScaleX) {
    return { size: baseSize, tracking: trackingUsed, scaleX, stage: "scaleX" };
  }

  // 3. 크기 — 자간·장평을 한계에 고정한 채 폭이 맞는 크기를 푼다
  const perPx = scalable * limits.minScaleX + fixed + (gaps > 0 ? limits.minTracking * gaps : 0);
  const size = Math.min(baseSize, maxWidth / Math.max(perPx, 1e-6));
  return {
    size,
    tracking: gaps > 0 ? limits.minTracking * size : 0,
    scaleX: limits.minScaleX,
    stage: "size",
  };
}

function sumWidths(widths: number[], mask: boolean[] | undefined, pick: boolean): number {
  let total = 0;
  widths.forEach((w, i) => {
    if ((mask?.[i] ?? false) === pick) total += w;
  });
  return total;
}

/** 글자 하나가 차지하는 폭(px). 고정 글자(띄어쓰기)는 장평을 적용하지 않는다. */
export function glyphAdvance(unitWidth: number, fit: Fit, isFixed: boolean): number {
  return unitWidth * fit.size * (isFixed ? 1 : fit.scaleX);
}

/** 맞춘 결과로 실제 차지하는 폭(px) */
export function fittedWidth(unitWidths: number[], fit: Fit, fixedMask?: boolean[]): number {
  const n = unitWidths.length;
  if (n === 0) return 0;
  const glyphs = unitWidths.reduce(
    (sum, w, i) => sum + glyphAdvance(w, fit, fixedMask?.[i] ?? false),
    0,
  );
  return glyphs + fit.tracking * (n - 1);
}

/**
 * 띄어쓰기에서 끊었을 때 짧은 줄이 긴 줄의 이 비율 이상이면 띄어쓰기에서 끊는다.
 * 이보다 한쪽으로 쏠리면 (예: "주식회사 / 한국스마트정보통신기술연구소", 약 29%)
 * 단어 중간에서 끊는다.
 */
export const MIN_SPACE_BREAK_BALANCE = 0.4;

const isAlnum = (c: string | undefined) => !!c && /[0-9A-Za-z]/.test(c);
/** 줄 첫머리에 올 수 없는 문자 */
const NO_LINE_START = new Set([",", ".", ")", "]", "}", "·", "%", ":", ";", "!", "?", "-", "~"]);
/** 줄 끝에 올 수 없는 문자 */
const NO_LINE_END = new Set(["(", "[", "{"]);

/**
 * 단어 중간에서 끊어도 되는 자리인지.
 * 숫자·영문이 이어지는 사이(235, 7F 등), 닫는 문장부호 앞, 여는 괄호 뒤는 끊지 않는다.
 */
function canBreakInsideWord(chars: string[], at: number): boolean {
  const prev = chars[at - 1];
  const next = chars[at];
  if (isAlnum(prev) && isAlnum(next)) return false;
  if (NO_LINE_START.has(next)) return false;
  if (NO_LINE_END.has(prev)) return false;
  return true;
}

/**
 * 두 줄로 나눌 위치를 고른다.
 *   1. 띄어쓰기에서 끊는 것이 기본이다.
 *   2. 가장 균형 잡힌 띄어쓰기 분리에서도 짧은 줄이 긴 줄의 MIN_SPACE_BREAK_BALANCE 에
 *      못 미칠 때만 단어 중간에서 끊는다. 이때도 canBreakInsideWord 가 막는 자리는 피한다.
 * @param spacesOnly 띄어쓰기에서만 나눌지 (이름처럼 단어 중간을 끊으면 안 되는 경우)
 * @returns 둘째 줄이 시작하는 글자 위치. 나눌 수 없으면 null
 */
export function chooseLineBreak(
  chars: string[],
  unitWidths: number[],
  spacesOnly = false,
): number | null {
  const n = chars.length;
  if (n < 2) return null;

  const widthOf = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && chars[a] === " ") a += 1;
    while (b > a && chars[b - 1] === " ") b -= 1;
    let w = 0;
    for (let i = a; i < b; i += 1) w += unitWidths[i];
    return w;
  };

  type Candidate = { at: number; score: number; balance: number };
  let bestWord: Candidate | null = null;
  let bestSpace: Candidate | null = null;
  for (let at = 1; at < n; at += 1) {
    const a = widthOf(0, at);
    const b = widthOf(at, n);
    const score = Math.max(a, b);
    const cand = { at, score, balance: score > 0 ? Math.min(a, b) / score : 0 };
    const atSpace = chars[at - 1] === " " || chars[at] === " ";
    // 균형이 같으면 뒤쪽(첫 줄이 긴 쪽)을 택한다. "주식회사 예시상사 / 서울지점" 처럼
    // 앞 단어들이 한 덩어리로 남는 편이 자연스럽다.
    if (atSpace) {
      if (!bestSpace || score <= bestSpace.score) bestSpace = cand;
    } else if (canBreakInsideWord(chars, at)) {
      if (!bestWord || score <= bestWord.score) bestWord = cand;
    }
  }

  if (spacesOnly) return bestSpace?.at ?? null;
  if (bestSpace && (!bestWord || bestSpace.balance >= MIN_SPACE_BREAK_BALANCE)) {
    return bestSpace.at;
  }
  return bestWord ? bestWord.at : (bestSpace?.at ?? null);
}
