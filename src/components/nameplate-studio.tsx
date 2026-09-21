"use client";

import { Download, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FontOption } from "@/lib/fonts";
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
  hint?: string;
}> = [
  { key: "bizNumber", label: "사업자등록번호", placeholder: "123-45-67890" },
  { key: "companyName", label: "상호", placeholder: "주식회사 예시" },
  { key: "ownerName", label: "성명", placeholder: "홍길동" },
  { key: "address", label: "사업장 소재지", placeholder: "서울특별시 중구 세종대로 110" },
  { key: "businessType", label: "업태", placeholder: "정보통신업" },
  { key: "businessItem", label: "종목", placeholder: "소프트웨어 개발 및 공급업" },
];

const DPI_OPTIONS = [300, 600, 1200];

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned.length > 0 ? cleaned : "명판";
}

export function NameplateStudio({ fonts }: { fonts: FontOption[] }) {
  const [content, setContent] = useState<NameplateContent>(DEFAULT_CONTENT);
  const [fontId, setFontId] = useState(fonts[0]?.id ?? "");
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [paperBackdrop, setPaperBackdrop] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0, mmW: 0, mmH: 0 });
  const [busy, setBusy] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef<HTMLCanvasElement | null>(null);

  const font = useMemo(
    () => fonts.find((f) => f.id === fontId) ?? fonts[0],
    [fonts, fontId],
  );

  const fullStyle: NameplateStyle | null = useMemo(
    () => (font ? { ...style, fontFamily: font.family } : null),
    [font, style],
  );

  useEffect(() => {
    if (!fullStyle) return;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      // next/font 가 붙여주는 Fallback 페이스는 로드에 실패하므로 첫 글꼴만 요청한다.
      // 이때 둘을 한 번에 넘기면 reject 되어 폰트가 준비되기 전에 그려진다.
      const primary = fullStyle.fontFamily.split(",")[0].trim();
      const used = Object.values(content).join("");
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

  const updateStyle = useCallback(
    <K extends keyof typeof DEFAULT_STYLE>(key: K, value: (typeof DEFAULT_STYLE)[K]) => {
      setStyle((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

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
    setStyle(DEFAULT_STYLE);
    setFontId(fonts[0]?.id ?? "");
  }, [fonts]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">명판 내용</CardTitle>
          <CardDescription>사업자등록증에 적힌 그대로 넣으면 됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="content">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="content">내용</TabsTrigger>
              <TabsTrigger value="design">디자인</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-4 space-y-4">
              {FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    value={content[field.key]}
                    placeholder={field.placeholder}
                    onChange={(e) => updateContent(field.key, e.target.value)}
                  />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="design" className="mt-4 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="font">글꼴</Label>
                <Select value={fontId} onValueChange={setFontId}>
                  <SelectTrigger id="font" className="w-full">
                    <SelectValue placeholder="글꼴 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {fonts.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                        <span className="text-muted-foreground ml-2 text-xs">{f.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>잉크 색</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {INK_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      type="button"
                      variant={style.color === preset.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateStyle("color", preset.value)}
                    >
                      <span
                        className="mr-1 size-3 rounded-full border"
                        style={{ backgroundColor: preset.value }}
                      />
                      {preset.label}
                    </Button>
                  ))}
                  <input
                    type="color"
                    aria-label="잉크 색 직접 선택"
                    value={style.color}
                    onChange={(e) => updateStyle("color", e.target.value)}
                    className="border-input h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
                  />
                </div>
              </div>

              <Separator />

              <SliderRow
                label="가로 길이"
                value={style.widthMm}
                min={40}
                max={100}
                step={1}
                suffix="mm"
                onChange={(v) => updateStyle("widthMm", v)}
              />
              <SliderRow
                label="가로세로 비율"
                value={style.aspectRatio}
                min={2}
                max={5}
                step={0.1}
                suffix=": 1"
                onChange={(v) => updateStyle("aspectRatio", v)}
              />
              <SliderRow
                label="획 굵기"
                value={style.weight}
                min={0}
                max={0.05}
                step={0.002}
                format={(v) => v.toFixed(3)}
                onChange={(v) => updateStyle("weight", v)}
              />
              <SliderRow
                label="잉크 질감"
                value={style.inkTexture}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => updateStyle("inkTexture", v)}
              />
              <SliderRow
                label="기울기"
                value={style.rotationDeg}
                min={-3}
                max={3}
                step={0.1}
                suffix="°"
                onChange={(v) => updateStyle("rotationDeg", v)}
              />

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="dpi">해상도</Label>
                <Select
                  value={String(style.dpi)}
                  onValueChange={(v) => updateStyle("dpi", Number(v))}
                >
                  <SelectTrigger id="dpi" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DPI_OPTIONS.map((dpi) => (
                      <SelectItem key={dpi} value={String(dpi)}>
                        {dpi} dpi
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ToggleRow
                id="space-owner"
                label="성명 자간 넓히기"
                hint="홍 길 동 처럼 한 글자씩 띄웁니다."
                checked={style.spaceOutOwnerName}
                onChange={(v) => updateStyle("spaceOutOwnerName", v)}
              />
              <ToggleRow
                id="border"
                label="테두리"
                hint="사각 테두리를 두릅니다."
                checked={style.border}
                onChange={(v) => updateStyle("border", v)}
              />
            </TabsContent>
          </Tabs>
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
              {size.w.toLocaleString()} × {size.h.toLocaleString()} px · {style.dpi} dpi
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {format ? format(value) : `${value}${suffix}`}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
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
