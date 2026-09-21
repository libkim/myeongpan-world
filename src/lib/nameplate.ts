/**
 * 사업자명판 렌더링 엔진.
 *
 * 명판은 서식의 공급자란에 찍혀 각 값이 제 칸에 들어가야 한다.
 * 칸 배치는 영수증·세금계산서·거래명세표 서식 여러 종의 공급자란을 실측해 평균 낸 값이다.
 * 글이 칸보다 길면 자간 → 장평 → 글자 크기 순으로 줄인다 (fit.ts).
 */

import { fitText, fittedWidth, type Fit, type FitLimits } from "./fit";

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
  /** 잉크 질감 강도 (0 ~ 1) */
  inkTexture: number;
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
}

const CELLS: Cell[] = [
  { key: "bizNumber", row: 0, x0: 0, x1: 1, align: "justify" },
  { key: "companyName", row: 1, x0: 0, x1: cellWidth(35.8), align: "left" },
  { key: "ownerName", row: 1, x0: 1 - cellWidth(29.2), x1: 1, align: "right" },
  { key: "address", row: 2, x0: 0, x1: 1, align: "justify" },
  { key: "businessType", row: 3, x0: 0, x1: cellWidth(28.8), align: "left" },
  { key: "businessItem", row: 3, x0: 1 - cellWidth(35.8), x1: 1, align: "right" },
];
const ROWS = 4;

/** 행 높이 대비 글자(한글 몸체) 높이 */
const TEXT_FILL = 0.6;
/** 행 높이 대비 칸 안쪽 좌우 여백 */
const CELL_INSET = 0.12;

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
  weight: 0.022,
  inkTexture: 0.15,
  rotationDeg: -0.4,
  dpi: 600,
  spaceOutOwnerName: true,
  border: false,
  minTracking: -0.05,
  minScaleX: 0.6,
};

function setFont(ctx: CanvasRenderingContext2D, family: string, size: number) {
  ctx.font = `${size}px ${family}`;
}

function cellText(content: NameplateContent, style: NameplateStyle, key: keyof NameplateContent) {
  const raw = content[key].trim();
  if (key === "ownerName" && style.spaceOutOwnerName) {
    return raw.replace(/\s+/g, "").split("").join(" ");
  }
  return raw;
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
    cursor += unitWidths[i] * fit.size * fit.scaleX + fit.tracking;
  });
}

/** 여러 옥타브를 겹친 부드러운 잡음. 잉크가 고르게 묻지 않은 느낌을 만든다. */
function fractalNoise(width: number, height: number, octaves: number): Float32Array {
  const acc = new Float32Array(width * height);
  let amp = 1;
  let total = 0;

  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext("2d");
  if (!sctx) return acc.fill(0.5);

  for (let o = 0; o < octaves; o += 1) {
    const res = 2 ** (o + 2);
    const seedCanvas = document.createElement("canvas");
    seedCanvas.width = res;
    seedCanvas.height = res;
    const seedCtx = seedCanvas.getContext("2d");
    if (!seedCtx) continue;
    const img = seedCtx.createImageData(res, res);
    for (let i = 0; i < res * res; i += 1) {
      const v = Math.floor(Math.random() * 256);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    seedCtx.putImageData(img, 0, 0);

    sctx.clearRect(0, 0, width, height);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(seedCanvas, 0, 0, width, height);
    const data = sctx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < acc.length; i += 1) {
      acc[i] += (data[i * 4] / 255) * amp;
    }
    total += amp;
    amp *= 0.5;
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < acc.length; i += 1) {
    acc[i] /= total;
    if (acc[i] < min) min = acc[i];
    if (acc[i] > max) max = acc[i];
  }
  const span = max - min || 1;
  for (let i = 0; i < acc.length; i += 1) {
    acc[i] = (acc[i] - min) / span;
  }
  return acc;
}

/** 글자 알파에 잡음을 곱해 농담을 흔든다. 획을 지우지는 않는다. */
function applyInkTexture(canvas: HTMLCanvasElement, strength: number) {
  if (strength <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const blot = fractalNoise(width, height, 5);
  const grain = fractalNoise(width, height, 7);

  const floor = 0.94 - 0.2 * strength;
  for (let i = 0; i < width * height; i += 1) {
    const alpha = image.data[i * 4 + 3];
    if (alpha === 0) continue;
    let keep = floor + (1 - floor) * blot[i];
    keep *= 0.97 + 0.03 * grain[i];
    image.data[i * 4 + 3] = Math.round(alpha * keep);
  }
  ctx.putImageData(image, 0, 0);
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  widthMm: number;
  heightMm: number;
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
  if (!ctx) return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm, fits };

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

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  for (const cell of CELLS) {
    const text = cellText(content, style, cell.key);
    if (!text) continue;
    const chars = Array.from(text);

    setFont(ctx, style.fontFamily, probe);
    const unitWidths = chars.map((ch) => ctx.measureText(ch).width / probe);

    const left = cell.x0 * width + inset;
    const right = cell.x1 * width - inset;
    const fit = fitText(unitWidths, right - left, baseSize, limits, cell.align === "justify");
    fits[cell.key] = fit;

    // 행 한가운데에 한글 몸체가 오도록 기준선을 잡는다.
    setFont(ctx, style.fontFamily, fit.size);
    const m = ctx.measureText("가힣");
    const ascent = m.actualBoundingBoxAscent || fit.size * 0.8;
    const descent = m.actualBoundingBoxDescent || 0;
    const baseline = rowHeight * cell.row + rowHeight / 2 + (ascent - descent) / 2;

    const used = fittedWidth(unitWidths, fit);
    const x = cell.align === "right" ? right - used : left;
    drawFitted(ctx, chars, unitWidths, fit, x, baseline, style.weight);
  }

  if (style.border) {
    const bw = Math.max(1, Math.round(0.35 * pxPerMm));
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2, bw / 2, width - bw, height - bw);
  }

  applyInkTexture(plate, style.inkTexture);

  // 검게 그린 글자를 잉크 색으로 갈아끼운다.
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = style.color;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";

  if (Math.abs(style.rotationDeg) < 0.01) {
    return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm, fits };
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
  if (!rctx) return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm, fits };
  rctx.translate(rw / 2, rh / 2);
  rctx.rotate(rad);
  rctx.drawImage(plate, -width / 2, -height / 2);

  return { canvas: rotated, widthMm: rw / pxPerMm, heightMm: rh / pxPerMm, fits };
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 변환에 실패했습니다."));
    }, "image/png");
  });
}
