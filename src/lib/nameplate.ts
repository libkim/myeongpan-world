/**
 * 사업자명판 렌더링 엔진.
 *
 * 명판은 네 줄의 좌우 끝이 모두 맞는 직사각형 덩어리로 찍힌다.
 * 줄마다 글자 수가 다르므로 줄별 크기를 달리하고, 자간을 늘려 폭을 채운다.
 */

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
}

export const DEFAULT_CONTENT: NameplateContent = {
  bizNumber: "123-45-67890",
  companyName: "주식회사 예시",
  ownerName: "홍길동",
  address: "서울특별시 중구 세종대로 110",
  businessType: "정보통신업",
  businessItem: "소프트웨어 개발 및 공급업",
};

export const DEFAULT_STYLE: Omit<NameplateStyle, "fontFamily"> = {
  widthMm: 66,
  aspectRatio: 3.1,
  color: "#1a2e78",
  weight: 0.022,
  inkTexture: 0.15,
  rotationDeg: -0.4,
  dpi: 600,
  spaceOutOwnerName: true,
  border: false,
};

const PAD_MM = 1.4;
const MIN_LEADING_RATIO = 0.18;

type Line =
  | { kind: "justify"; text: string; scale: number }
  | { kind: "split"; left: string; right: string; scale: number };

function spaceOut(text: string): string {
  return text.split("").join(" ");
}

function buildLines(content: NameplateContent, style: NameplateStyle): Line[] {
  const owner = style.spaceOutOwnerName
    ? spaceOut(content.ownerName.replace(/\s+/g, ""))
    : content.ownerName;

  return [
    { kind: "justify", text: content.bizNumber, scale: 1.26 },
    { kind: "split", left: content.companyName, right: owner, scale: 1.26 },
    { kind: "justify", text: content.address, scale: 1.0 },
    { kind: "split", left: content.businessType, right: content.businessItem, scale: 1.2 },
  ];
}

function setFont(ctx: CanvasRenderingContext2D, family: string, size: number) {
  ctx.font = `${size}px ${family}`;
}

/** 자간을 무시한 순수 글자 폭. 이 값이 가용 폭을 넘지 않도록 기준 크기를 잡는다. */
function naturalWidth(
  ctx: CanvasRenderingContext2D,
  line: Line,
  family: string,
  base: number,
): number {
  setFont(ctx, family, base * line.scale);
  if (line.kind === "justify") {
    return line.text.split("").reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  }
  // 좌우 분리 줄은 두 덩어리 사이에 최소 간격을 둔다.
  return (
    ctx.measureText(line.left).width +
    ctx.measureText(line.right).width +
    ctx.measureText("    ").width
  );
}

function lineHeight(ctx: CanvasRenderingContext2D, family: string, size: number): number {
  setFont(ctx, family, size);
  const m = ctx.measureText("가힣0A");
  const ascent = m.actualBoundingBoxAscent || size * 0.8;
  const descent = m.actualBoundingBoxDescent || size * 0.2;
  return ascent + descent;
}

function drawJustified(
  ctx: CanvasRenderingContext2D,
  text: string,
  x0: number,
  x1: number,
  baseline: number,
  strokeWidth: number,
) {
  const chars = text.split("");
  if (chars.length === 0) return;
  const natural = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0);
  const extra = chars.length > 1 ? (x1 - x0 - natural) / (chars.length - 1) : 0;
  let x = x0;
  for (const ch of chars) {
    if (strokeWidth > 0) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(ch, x, baseline);
    }
    ctx.fillText(ch, x, baseline);
    x += ctx.measureText(ch).width + extra;
  }
}

function drawSplit(
  ctx: CanvasRenderingContext2D,
  left: string,
  right: string,
  x0: number,
  x1: number,
  baseline: number,
  strokeWidth: number,
) {
  if (strokeWidth > 0) ctx.lineWidth = strokeWidth;
  ctx.textAlign = "left";
  if (strokeWidth > 0) ctx.strokeText(left, x0, baseline);
  ctx.fillText(left, x0, baseline);
  ctx.textAlign = "right";
  if (strokeWidth > 0) ctx.strokeText(right, x1, baseline);
  ctx.fillText(right, x1, baseline);
  ctx.textAlign = "left";
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
}

export function renderNameplate(
  content: NameplateContent,
  style: NameplateStyle,
): RenderResult {
  const pxPerMm = style.dpi / 25.4;
  const width = Math.max(1, Math.round(style.widthMm * pxPerMm));
  const height = Math.max(1, Math.round(width / style.aspectRatio));
  const pad = Math.round(PAD_MM * pxPerMm);
  const avail = Math.max(1, width - pad * 2);

  const plate = document.createElement("canvas");
  plate.width = width;
  plate.height = height;
  const ctx = plate.getContext("2d");
  if (!ctx) return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm };

  const lines = buildLines(content, style);

  // 모든 줄이 가용 폭 안에 들어가는 최대 기준 크기를 이분 탐색한다.
  let lo = 4;
  let hi = Math.max(8, Math.round(height));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const widest = Math.max(...lines.map((l) => naturalWidth(ctx, l, style.fontFamily, mid)));
    if (widest <= avail) lo = mid;
    else hi = mid - 1;
  }
  const base = lo;

  const heights = lines.map((l) => lineHeight(ctx, style.fontFamily, base * l.scale));
  const totalText = heights.reduce((a, b) => a + b, 0);
  const gaps = lines.length - 1;
  const leading = Math.max(
    base * MIN_LEADING_RATIO,
    gaps > 0 ? (height - pad * 2 - totalText) / gaps : 0,
  );

  const blockHeight = totalText + leading * gaps;
  let y = (height - blockHeight) / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  lines.forEach((line, i) => {
    const size = base * line.scale;
    setFont(ctx, style.fontFamily, size);
    const m = ctx.measureText("가힣0A");
    const ascent = m.actualBoundingBoxAscent || size * 0.8;
    const baseline = y + ascent;
    const strokeWidth = style.weight > 0 ? size * style.weight * 2 : 0;

    if (line.kind === "justify") {
      drawJustified(ctx, line.text, pad, width - pad, baseline, strokeWidth);
    } else {
      drawSplit(ctx, line.left, line.right, pad, width - pad, baseline, strokeWidth);
    }
    y += heights[i] + leading;
  });

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
    return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm };
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
  if (!rctx) return { canvas: plate, widthMm: style.widthMm, heightMm: height / pxPerMm };
  rctx.translate(rw / 2, rh / 2);
  rctx.rotate(rad);
  rctx.drawImage(plate, -width / 2, -height / 2);

  return { canvas: rotated, widthMm: rw / pxPerMm, heightMm: rh / pxPerMm };
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 변환에 실패했습니다."));
    }, "image/png");
  });
}
