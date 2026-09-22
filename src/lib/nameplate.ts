/**
 * 사업자명판 렌더링 엔진.
 *
 * 명판은 서식의 공급자란에 찍혀 각 값이 제 칸에 들어가야 한다.
 * 칸 배치는 영수증·세금계산서·거래명세표 서식 여러 종의 공급자란을 실측해 평균 낸 값이다.
 * 글이 칸보다 길면 자간 → 장평 → 글자 크기 순으로 줄인다 (fit.ts).
 * 그래도 최소 글자 크기 아래로 내려가면 두 줄로 나눈다.
 */

import {
  chooseLineBreak,
  fitText,
  fittedWidth,
  glyphAdvance,
  type Fit,
  type FitLimits,
} from "./fit";
import { applyStamp, type StampRegion, type StampStyle } from "./stamp";

export interface NameplateContent {
  /** 사업자등록번호 */
  bizNumber: string;
  /** 상호 */
  companyName: string;
  /** 대표자 성명 */
  ownerName: string;
  /** 사업장 소재지 */
  address: string;
  /** 업태 */
  businessType: string;
  /** 종목 */
  businessItem: string;
}

export interface NameplateStyle {
  fontFamily: string;
  /** 명판 가로 길이(mm) */
  widthMm: number;
  /** 가로:세로 비율 */
  aspectRatio: number;
  /** 잉크 색 (#rrggbb) */
  color: string;
  /** 획 굵기 비율 (0 ~ 0.05) */
  weight: number;
  /** 인영 질감의 시드. 같은 시드면 항상 같은 모양으로 찍힌다 */
  inkSeed: number;
  /** 인영 스타일 */
  stampStyle: StampStyle;
  /** 기울기(도) */
  rotationDeg: number;
  /** 출력 해상도 */
  dpi: number;
  /** 성명 자간을 넓힐지 */
  spaceOutOwnerName: boolean;
  /** 테두리 표시 */
  border: boolean;
  /** 칸에 맞출 때 허용하는 최소 자간 (글자 크기 대비) */
  minTracking: number;
  /** 칸에 맞출 때 허용하는 최소 장평 */
  minScaleX: number;
  /** 기본 크기 대비 최소 글자 크기. 한 줄로 이보다 작아지면 두 줄로 나눈다 */
  minTextScale: number;
}

/*
 * 공급자란 실측 평균 (공급자란 폭 = 100%)
 *   항목 라벨 칸 끝 28.5% — 명판은 여기서부터 오른쪽 끝까지(71.5%)를 차지한다
 *   상호 35.8% · 성명 29.2% · 업태 28.8% · 종목 35.8% · 등록번호/소재지 71.5%
 *   네 행 높이는 각 25% 로 같고, 공급자란 가로세로비는 2.28 : 1
 */
const VALUE_AREA = 71.5;
const cellWidth = (pct: number) => pct / VALUE_AREA;

/** 명판 가로세로비 = 공급자란 가로세로비 × 값 영역 폭 비율 */
export const PLATE_ASPECT = Math.round(2.28 * (VALUE_AREA / 100) * 100) / 100;

type Align = "justify" | "left" | "right";

interface Cell {
  key: keyof NameplateContent;
  row: number;
  /** 명판 폭 대비 칸 시작·끝 (0 ~ 1) */
  x0: number;
  x1: number;
  align: Align;
  /** 너무 작아지면 두 줄로 나눠도 되는 칸인지 */
  wrap: boolean;
  /** 두 줄로 나눌 때 띄어쓰기에서만 끊을지 */
  wrapAtSpaceOnly?: boolean;
}

const CELLS: Cell[] = [
  { key: "bizNumber", row: 0, x0: 0, x1: 1, align: "justify", wrap: false },
  { key: "companyName", row: 1, x0: 0, x1: cellWidth(35.8), align: "left", wrap: true },
  {
    key: "ownerName",
    row: 1,
    x0: 1 - cellWidth(29.2),
    x1: 1,
    align: "right",
    wrap: true,
    wrapAtSpaceOnly: true,
  },
  { key: "address", row: 2, x0: 0, x1: 1, align: "justify", wrap: true },
  { key: "businessType", row: 3, x0: 0, x1: cellWidth(28.8), align: "left", wrap: true },
  { key: "businessItem", row: 3, x0: 1 - cellWidth(35.8), x1: 1, align: "right", wrap: true },
];
const ROWS = 4;

/** 행 높이 대비 글자(한글 몸체) 높이 */
const TEXT_FILL = 0.6;
/** 행 높이 대비 칸 안쪽 좌우 여백 */
const CELL_INSET = 0.12;
/** 두 줄일 때 두 줄 묶음이 차지하는 행 높이 비율과, 한글 몸체 높이 대비 줄 간격 */
const WRAP_FILL = 0.84;
const WRAP_GAP = 0.25;
/** '성명 자간 넓히기' 를 켰을 때 쓰는 자간 (글자 크기 대비) */
const NAME_TRACKING = 0.4;

export const DEFAULT_CONTENT: NameplateContent = {
  bizNumber: "123-45-67890",
  companyName: "주식회사 예시",
  ownerName: "홍길동",
  address: "서울특별시 중구 세종대로 110",
  businessType: "정보통신업",
  businessItem: "소프트웨어 개발 및 공급업",
};

export const DEFAULT_STYLE: Omit<NameplateStyle, "fontFamily"> = {
  widthMm: 50,
  aspectRatio: PLATE_ASPECT,
  color: "#1a2e78",
  weight: 0.014,
  inkSeed: 1,
  stampStyle: "rough",
  rotationDeg: 0,
  dpi: 600,
  spaceOutOwnerName: true,
  border: false,
  minTracking: -0.05,
  minScaleX: 0.6,
  minTextScale: 0.6,
};

function setFont(ctx: CanvasRenderingContext2D, family: string, size: number) {
  ctx.font = `${size}px ${family}`;
}

function cellText(content: NameplateContent, key: keyof NameplateContent) {
  return content[key].trim().replace(/\s+/g, " ");
}

function bodyMetrics(ctx: CanvasRenderingContext2D, family: string, size: number) {
  setFont(ctx, family, size);
  const m = ctx.measureText("가힣");
  return {
    ascent: m.actualBoundingBoxAscent || size * 0.8,
    descent: m.actualBoundingBoxDescent || 0,
  };
}

interface WrappedLine {
  chars: string[];
  widths: number[];
  fixed: boolean[];
}

const spaceMask = (chars: string[]) => chars.map((c) => c === " ");

/** 두 줄로 나눠 맞춘다. 두 줄은 같은 크기로 쓰고, 긴 줄 기준으로 크기를 정한다. */
function wrapInTwo(
  chars: string[],
  unitWidths: number[],
  maxWidth: number,
  rowHeight: number,
  bodyRatio: number,
  limits: FitLimits,
  opts: { spacesOnly: boolean; preferredTracking: number },
): { size: number; lines: WrappedLine[]; fits: Fit[] } | null {
  const at = chooseLineBreak(chars, unitWidths, opts.spacesOnly);
  if (at === null) return null;

  const trim = (from: number, to: number): WrappedLine => {
    let a = from;
    let b = to;
    while (a < b && chars[a] === " ") a += 1;
    while (b > a && chars[b - 1] === " ") b -= 1;
    const part = chars.slice(a, b);
    return { chars: part, widths: unitWidths.slice(a, b), fixed: spaceMask(part) };
  };
  const lines = [trim(0, at), trim(at, chars.length)];
  if (lines.some((l) => l.chars.length === 0)) return null;

  const base = (rowHeight * WRAP_FILL) / (bodyRatio * (2 + WRAP_GAP));
  const t = opts.preferredTracking;
  const size = Math.min(
    ...lines.map((l) => fitText(l.widths, maxWidth, base, limits, false, t, l.fixed).size),
  );
  // 정한 크기를 기본값으로 두고 다시 맞춰, 짧은 줄은 덜 좁히게 한다.
  const fits = lines.map((l) => fitText(l.widths, maxWidth, size, limits, false, t, l.fixed));
  return { size, lines, fits };
}

/** 글자별로 자간·장평을 적용해 그린다. */
function drawFitted(
  ctx: CanvasRenderingContext2D,
  chars: string[],
  unitWidths: number[],
  fit: Fit,
  x: number,
  baseline: number,
  strokeRatio: number,
) {
  const strokeWidth = strokeRatio > 0 ? fit.size * strokeRatio * 2 : 0;
  let cursor = x;
  chars.forEach((ch, i) => {
    ctx.save();
    ctx.translate(cursor, baseline);
    ctx.scale(fit.scaleX, 1);
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(ch, 0, 0);
    }
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    cursor += glyphAdvance(unitWidths[i], fit, ch === " ") + fit.tracking;
  });
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  widthMm: number;
  heightMm: number;
  /**
   * 기울이기 전 명판 크기(px). 기울이면 캔버스가 잘리지 않게 커지므로,
   * 명판을 서식 칸에 얹을 때는 캔버스가 아니라 이 크기를 기준으로 맞춘다.
   */
  plateWidth: number;
  plateHeight: number;
  /** 칸별로 어느 단계까지 줄였는지 */
  fits: Partial<Record<keyof NameplateContent, Fit>>;
}

export function renderNameplate(
  content: NameplateContent,
  style: NameplateStyle,
): RenderResult {
  const pxPerMm = style.dpi / 25.4;
  const width = Math.max(1, Math.round(style.widthMm * pxPerMm));
  const height = Math.max(1, Math.round(width / style.aspectRatio));
  const fits: RenderResult["fits"] = {};

  const plate = document.createElement("canvas");
  plate.width = width;
  plate.height = height;
  const ctx = plate.getContext("2d");
  if (!ctx) return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm, plateWidth: width, plateHeight: height, fits };

  const rowHeight = height / ROWS;
  const inset = rowHeight * CELL_INSET;
  const limits: FitLimits = { minTracking: style.minTracking, minScaleX: style.minScaleX };

  // 한글 몸체 높이가 행 높이의 TEXT_FILL 이 되는 크기를 기본 크기로 삼는다.
  const probe = 100;
  setFont(ctx, style.fontFamily, probe);
  const pm = ctx.measureText("가힣");
  const bodyRatio =
    ((pm.actualBoundingBoxAscent || probe * 0.8) + (pm.actualBoundingBoxDescent || 0)) / probe;
  const baseSize = (rowHeight * TEXT_FILL) / bodyRatio;

  // 칸마다 최종 글자 크기를 모아 인영 효과 크기를 맞추는 데 쓴다.
  const regions: StampRegion[] = [];
  const addRegion = (cell: Cell, size: number) =>
    regions.push({
      x0: cell.x0 * width,
      x1: cell.x1 * width,
      y0: rowHeight * cell.row,
      y1: rowHeight * (cell.row + 1),
      unit: rowHeight * (size / baseSize),
    });

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  for (const cell of CELLS) {
    const text = cellText(content, cell.key);
    // 성명 자간 넓히기는 공백을 끼우지 않고 '원하는 자간' 으로 준다.
    // 칸이 좁으면 맞춤 규칙이 이 간격부터 줄인다.
    // "홍 길 동" 식 표기는 띄어쓰기 없는 이름의 관례라, 띄어쓰기가 있는 이름에는 쓰지 않는다.
    const preferredTracking =
      cell.key === "ownerName" && style.spaceOutOwnerName && !text.includes(" ")
        ? NAME_TRACKING
        : 0;
    if (!text) continue;
    const chars = Array.from(text);
    const fixed = spaceMask(chars);

    setFont(ctx, style.fontFamily, probe);
    const unitWidths = chars.map((ch) => ctx.measureText(ch).width / probe);

    const left = cell.x0 * width + inset;
    const right = cell.x1 * width - inset;
    const maxWidth = right - left;
    const rowTop = rowHeight * cell.row;
    const fit = fitText(
      unitWidths,
      maxWidth,
      baseSize,
      limits,
      cell.align === "justify",
      preferredTracking,
      fixed,
    );

    const wrapped =
      cell.wrap && fit.size < baseSize * style.minTextScale
        ? wrapInTwo(chars, unitWidths, maxWidth, rowHeight, bodyRatio, limits, {
            spacesOnly: cell.wrapAtSpaceOnly ?? false,
            preferredTracking,
          })
        : null;

    if (wrapped && wrapped.size > fit.size) {
      fits[cell.key] = { ...wrapped.fits[0], size: wrapped.size, stage: "wrap" };
      addRegion(cell, wrapped.size);
      const { ascent, descent } = bodyMetrics(ctx, style.fontFamily, wrapped.size);
      const body = ascent + descent;
      const gap = body * WRAP_GAP;
      const top = rowTop + (rowHeight - (body * 2 + gap)) / 2;
      wrapped.lines.forEach((line, i) => {
        const lf = wrapped.fits[i];
        const used = fittedWidth(line.widths, lf, line.fixed);
        // 두 줄일 때 양쪽 정렬 칸은 왼쪽 정렬로 바꾼다. 짧은 둘째 줄이 벌어지지 않게.
        const x = cell.align === "right" ? right - used : left;
        drawFitted(ctx, line.chars, line.widths, lf, x, top + i * (body + gap) + ascent, style.weight);
      });
      continue;
    }

    fits[cell.key] = fit;
    addRegion(cell, fit.size);
    // 행 한가운데에 한글 몸체가 오도록 기준선을 잡는다.
    const { ascent, descent } = bodyMetrics(ctx, style.fontFamily, fit.size);
    const baseline = rowTop + rowHeight / 2 + (ascent - descent) / 2;
    const used = fittedWidth(unitWidths, fit, fixed);
    const x = cell.align === "right" ? right - used : left;
    drawFitted(ctx, chars, unitWidths, fit, x, baseline, style.weight);
  }

  if (style.border) {
    const bw = Math.max(1, Math.round(0.35 * pxPerMm));
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, width - bw, height - bw);
  }

  // 검게 그린 글자를 고무인으로 찍은 인영으로 바꾸고 잉크 색을 입힌다.
  applyStamp(plate, {
    color: style.color,
    unit: rowHeight,
    regions,
    rows: ROWS,
    seed: style.inkSeed,
    style: style.stampStyle,
  });

  if (Math.abs(style.rotationDeg) < 0.01) {
    return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm, plateWidth: width, plateHeight: height, fits };
  }

  const rad = (style.rotationDeg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const rw = Math.ceil(width * cos + height * sin);
  const rh = Math.ceil(width * sin + height * cos);

  const rotated = document.createElement("canvas");
  rotated.width = rw;
  rotated.height = rh;
  const rctx = rotated.getContext("2d");
  if (!rctx) return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm, plateWidth: width, plateHeight: height, fits };
  rctx.translate(rw / 2, rh / 2);
  rctx.rotate(rad);
  rctx.drawImage(plate, -width / 2, -height / 2);

  return {
    canvas: rotated,
    widthMm: rw / pxPerMm,
    heightMm: rh / pxPerMm,
    plateWidth: width,
    plateHeight: height,
    fits,
  };
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 변환에 실패했습니다."));
    }, "image/png");
  });
}
