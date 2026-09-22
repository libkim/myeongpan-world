"use client";

import { Download, RotateCcw, Shuffle, Stamp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { Fit } from "@/lib/fit";
import type { FontOption } from "@/lib/fonts";
import type { StampStyle } from "@/lib/stamp";
import {
  canvasToPngBlob,
  DEFAULT_CONTENT,
  DEFAULT_STYLE,
  renderNameplate,
  type NameplateContent,
  type NameplateStyle,
} from "@/lib/nameplate";

const INK_PRESETS = [
  { label: "감청", value: "#1a2e78" },
  { label: "먹", value: "#16181d" },
  { label: "인주", value: "#9c1c1c" },
];

const FIELDS: Array<{
  key: keyof NameplateContent;
  label: string;
  placeholder: string;
}> = [
  { key: "bizNumber", label: "사업자등록번호", placeholder: "123-45-67890" },
  { key: "companyName", label: "상호", placeholder: "주식회사 예시" },
  { key: "ownerName", label: "성명", placeholder: "홍길동" },
  { key: "address", label: "사업장 소재지", placeholder: "서울특별시 중구 세종대로 110" },
  { key: "businessType", label: "업태", placeholder: "정보통신업" },
  { key: "businessItem", label: "종목", placeholder: "소프트웨어 개발 및 공급업" },
];

/** '반듯하게' 에서 쓰는 고정 시드. 언제 열어도 같은 인영이 찍힌다. */
const FIXED_SEED = 1;

/** '랜덤하게' 의 기울기 범위(도). 방향도 무작위로 고른다. */
const TILT_MIN = 0.5;
const TILT_MAX = 1.5;

function randomTilt(): number {
  const deg = TILT_MIN + Math.random() * (TILT_MAX - TILT_MIN);
  const signed = Math.random() < 0.5 ? -deg : deg;
  return Math.round(signed * 10) / 10;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned.length > 0 ? cleaned : "명판";
}

export function NameplateStudio({ fonts }: { fonts: FontOption[] }) {
  const [content, setContent] = useState<NameplateContent>(DEFAULT_CONTENT);
  const [fontId, setFontId] = useState(fonts[0]?.id ?? "");
  const [widthMm, setWidthMm] = useState(DEFAULT_STYLE.widthMm);
  const [color, setColor] = useState(DEFAULT_STYLE.color);
  // 재생성: 반듯하게 = 고정 시드 + 기울기 0, 랜덤하게 = 누를 때마다 새 시드 + 새 기울기
  const [regen, setRegen] = useState({ seed: FIXED_SEED, tilt: 0 });
  const tilt = regen.tilt;
  const inkSeed = regen.seed;
  const [stampStyle, setStampStyle] = useState<StampStyle>(DEFAULT_STYLE.stampStyle);
  const [paperBackdrop, setPaperBackdrop] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0, mmW: 0, mmH: 0 });
  const [fits, setFits] = useState<Partial<Record<keyof NameplateContent, Fit>>>({});
  const [busy, setBusy] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef<HTMLCanvasElement | null>(null);

  const font = useMemo(
    () => fonts.find((f) => f.id === fontId) ?? fonts[0],
    [fonts, fontId],
  );

  // 사용자가 고르는 건 가로 길이·잉크 색·글꼴·기울기뿐이고 나머지는 고정값을 쓴다.
  const fullStyle: NameplateStyle | null = useMemo(
    () =>
      font
        ? {
            ...DEFAULT_STYLE,
            widthMm,
            color,
            rotationDeg: tilt,
            inkSeed,
            stampStyle,
            fontFamily: font.family,
          }
        : null,
    [font, widthMm, color, tilt, inkSeed, stampStyle],
  );

  useEffect(() => {
    if (!fullStyle) return;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      // next/font 가 붙여주는 Fallback 페이스는 로드에 실패하므로 첫 글꼴만 요청한다.
      // 이때 둘을 한 번에 넘기면 reject 되어 폰트가 준비되기 전에 그려진다.
      const primary = fullStyle.fontFamily.split(",")[0].trim();
      // 엔진이 기준 글자 크기를 잴 때 쓰는 "가힣0A" 도 함께 받는다.
      // 빠지면 첫 렌더만 대체 글꼴로 재서 글자 크기가 조금 달라진다.
      const used = Object.values(content).join("") + "가힣0A";
      try {
        await document.fonts.load(`400 64px ${primary}`, used);
      } catch {
        // 내려받지 못하면 대체 글꼴로 그린다.
      }
      try {
        await document.fonts.ready;
      } catch {
        // 무시하고 진행한다.
      }
      if (cancelled) return;

      const result = renderNameplate(content, fullStyle);
      renderedRef.current = result.canvas;
      setSize({
        w: result.canvas.width,
        h: result.canvas.height,
        mmW: result.widthMm,
        mmH: result.heightMm,
      });
      setFits(result.fits);

      const dest = previewRef.current;
      if (dest) {
        dest.width = result.canvas.width;
        dest.height = result.canvas.height;
        const ctx = dest.getContext("2d");
        ctx?.clearRect(0, 0, dest.width, dest.height);
        ctx?.drawImage(result.canvas, 0, 0);
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content, fullStyle]);

  const updateContent = useCallback((key: keyof NameplateContent, value: string) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleDownload = useCallback(async () => {
    const canvas = renderedRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const blob = await canvasToPngBlob(canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sanitizeFileName(content.companyName)}_명판.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("명판 이미지를 내려받았습니다.");
    } catch {
      toast.error("이미지를 만드는 중 문제가 생겼습니다.");
    } finally {
      setBusy(false);
    }
  }, [content.companyName]);

  const handleReset = useCallback(() => {
    setContent(DEFAULT_CONTENT);
    setFontId(fonts[0]?.id ?? "");
    setWidthMm(DEFAULT_STYLE.widthMm);
    setColor(DEFAULT_STYLE.color);
    setRegen({ seed: FIXED_SEED, tilt: 0 });
    setStampStyle(DEFAULT_STYLE.stampStyle);
  }, [fonts]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">명판 내용</CardTitle>
          <CardDescription>사업자등록증에 적힌 그대로 넣으면 됩니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <FitHint fit={fits[field.key]} />
                </div>
                <Input
                  id={field.key}
                  value={content[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) => updateContent(field.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>가로 길이</Label>
              <span className="text-muted-foreground text-xs tabular-nums">{widthMm}mm</span>
            </div>
            <Slider
              value={[widthMm]}
              min={30}
              max={100}
              step={1}
              onValueChange={([v]) => setWidthMm(v)}
            />
            <p className="text-muted-foreground text-xs">
              서식의 공급자란에서 항목 이름 칸을 뺀 폭에 맞추면 됩니다.
            </p>
          </div>

          <ChoiceRow label="잉크 색">
            {INK_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                size="sm"
                variant={color === preset.value ? "default" : "outline"}
                onClick={() => setColor(preset.value)}
              >
                <span
                  className="size-3 rounded-full border"
                  style={{ backgroundColor: preset.value }}
                />
                {preset.label}
              </Button>
            ))}
          </ChoiceRow>

          <ChoiceRow label="글꼴">
            {fonts.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={fontId === f.id ? "default" : "outline"}
                onClick={() => setFontId(f.id)}
                title={f.hint}
              >
                {f.label}
              </Button>
            ))}
          </ChoiceRow>

          <ChoiceRow label="인영 스타일">
            {(
              [
                ["rough", "거친 인영"],
                ["carved", "새김 인영"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={stampStyle === value ? "default" : "outline"}
                onClick={() => setStampStyle(value)}
              >
                {label}
              </Button>
            ))}
          </ChoiceRow>

          <ChoiceRow label="재생성">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRegen({ seed: FIXED_SEED, tilt: 0 })}
              title="정해진 인영 모양으로 똑바로 다시 찍습니다"
            >
              <Stamp className="size-3.5" />
              반듯하게
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setRegen({
                  seed: Math.floor(Math.random() * 2 ** 31),
                  tilt: randomTilt(),
                })
              }
              title="누를 때마다 인영 모양과 기울기를 새로 뽑습니다"
            >
              <Shuffle className="size-3.5" />
              랜덤하게
            </Button>
          </ChoiceRow>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-8">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">미리보기</CardTitle>
            <CardDescription>배경은 투명하게 저장됩니다.</CardDescription>
          </div>
          {size.w > 0 && (
            <Badge variant="secondary" className="shrink-0 font-normal">
              {size.mmW.toFixed(1)} × {size.mmH.toFixed(1)} mm
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex items-center justify-center overflow-hidden rounded-lg border p-4"
            style={
              paperBackdrop
                ? { backgroundColor: "#faf8f3" }
                : {
                    backgroundImage:
                      "linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
                  }
            }
          >
            <canvas ref={previewRef} className="h-auto w-full max-w-full" />
          </div>

          <ToggleRow
            id="paper"
            label="종이 배경으로 보기"
            hint="끄면 투명 격자 위에서 확인합니다."
            checked={paperBackdrop}
            onChange={setPaperBackdrop}
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleDownload} disabled={busy || size.w === 0} className="flex-1">
              <Download className="size-4" />
              투명 PNG 내려받기
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="size-4" />
              초기화
            </Button>
          </div>

          {size.w > 0 && (
            <p className="text-muted-foreground text-xs">
              {size.w.toLocaleString()} × {size.h.toLocaleString()} px · {DEFAULT_STYLE.dpi} dpi
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const STAGE_LABEL: Record<Fit["stage"], string> = {
  fits: "",
  tracking: "자간 조정",
  scaleX: "장평",
  size: "글자 축소",
  wrap: "줄바꿈",
};

function FitHint({ fit }: { fit?: Fit }) {
  if (!fit || fit.stage === "fits") return null;
  const detail =
    fit.stage === "scaleX" || fit.stage === "size" ? ` ${Math.round(fit.scaleX * 100)}%` : "";
  return (
    <span
      className={
        fit.stage === "size" ? "text-xs text-amber-600" : "text-muted-foreground text-xs"
      }
    >
      {STAGE_LABEL[fit.stage]}
      {detail}
    </span>
  );
}

function ChoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
