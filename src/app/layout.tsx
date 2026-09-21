import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "명판월드 — 사업자명판 이미지 만들기",
  description:
    "사업자등록증 정보를 입력하면 배경이 투명한 사업자명판 이미지를 바로 내려받을 수 있습니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${fontVariables} h-full antialiased`}>
      <body className="bg-muted/30 flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
