import { NameplateStudio } from "@/components/nameplate-studio";
import { FONT_OPTIONS } from "@/lib/fonts";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">명판월드</h1>
        <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
          사업자등록증에 적힌 내용을 넣으면 배경이 투명한 사업자명판 이미지를 만들어 드립니다.
          계약서나 신청서의 명판 칸에 그대로 얹어 쓸 수 있습니다.
        </p>
      </header>
      <NameplateStudio fonts={FONT_OPTIONS} />
      <footer className="text-muted-foreground mt-12 border-t pt-6 text-xs">
        입력한 내용은 브라우저 안에서만 처리되며 서버로 전송되거나 저장되지 않습니다.
      </footer>
    </main>
  );
}
