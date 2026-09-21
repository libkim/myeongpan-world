/**
 * 글자를 칸 폭에 맞추는 규칙.
 *
 * 칸보다 글이 길면 다음 순서로 줄인다. 앞 단계가 한계에 닿았을 때만 다음 단계로 넘어간다.
 *   1. 자간을 좁힌다 (최소 자간까지)
 *   2. 장평(글자 폭)을 줄인다 (최소 장평까지)
 *   3. 그래도 넘치면 그때 글자 크기를 줄인다
 * 칸보다 짧으면 크기는 그대로 두고, 양쪽 정렬 칸만 자간을 벌려 폭을 채운다.
 */

export interface FitLimits {
  /** 허용하는 가장 좁은 자간. 글자 크기 대비 비율이며 음수면 글자끼리 붙인다. */
  minTracking: number;
  /** 허용하는 가장 좁은 장평 (1 = 원래 폭) */
  minScaleX: number;
}

export type FitStage = "fits" | "tracking" | "scaleX" | "size";

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
 */
export function fitText(
  unitWidths: number[],
  maxWidth: number,
  baseSize: number,
  limits: FitLimits,
  justify: boolean,
): Fit {
  const n = unitWidths.length;
  if (n === 0 || maxWidth <= 0) return { size: baseSize, tracking: 0, scaleX: 1, stage: "fits" };

  const unit = unitWidths.reduce((a, b) => a + b, 0);
  const gaps = n - 1;
  const natural = unit * baseSize;

  if (natural <= maxWidth) {
    const tracking = justify && gaps > 0 ? (maxWidth - natural) / gaps : 0;
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
  const scaleX = (maxWidth - trackingUsed * gaps) / natural;
  if (scaleX >= limits.minScaleX) {
    return { size: baseSize, tracking: trackingUsed, scaleX, stage: "scaleX" };
  }

  // 3. 크기 — 자간·장평을 한계에 고정한 채 폭이 맞는 크기를 푼다
  const perPx = unit * limits.minScaleX + (gaps > 0 ? limits.minTracking * gaps : 0);
  const size = Math.min(baseSize, maxWidth / Math.max(perPx, 1e-6));
  return {
    size,
    tracking: gaps > 0 ? limits.minTracking * size : 0,
    scaleX: limits.minScaleX,
    stage: "size",
  };
}

/** 맞춘 결과로 실제 차지하는 폭(px) */
export function fittedWidth(unitWidths: number[], fit: Fit): number {
  const n = unitWidths.length;
  if (n === 0) return 0;
  const glyphs = unitWidths.reduce((a, b) => a + b, 0) * fit.size * fit.scaleX;
  return glyphs + fit.tracking * (n - 1);
}
