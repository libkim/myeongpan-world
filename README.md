# 명판월드

사업자등록증에 적힌 내용을 입력하면 **배경이 투명한 사업자명판 이미지**를 만들어 주는 웹앱입니다.
계약서·신청서의 명판 칸에 그대로 얹어 쓸 수 있습니다.

## 특징

- **서식 칸에 맞춘 배치** — 영수증·세금계산서·거래명세표 공급자란을 실측해 평균 낸 칸 비율로
  사업자번호 / 상호·성명 / 사업장 소재지 / 업태·종목을 배치합니다. 네 행 높이는 같습니다.
- **글자 맞춤 순서** — 칸보다 글이 길면 자간을 먼저 좁히고, 최소 자간에 닿으면 장평을 줄이고,
  최소 장평에도 닿았을 때만 글자 크기를 줄입니다. 최소 자간·장평은 화면에서 조절할 수 있습니다.
- **투명 배경 PNG** — 도장처럼 문서 위에 바로 겹쳐 쓸 수 있습니다.
- **잉크 질감** — 도장 면이 고르게 눌리지 않아 생기는 농담을 흉내 냅니다. 획을 지우지 않고 농도만 흔듭니다.
- **실시간 미리보기** — 종이 배경과 투명 격자를 오가며 확인할 수 있습니다.
- **인쇄 해상도 선택** — 300 / 600 / 1200 dpi.
- 입력값은 **브라우저 안에서만** 처리됩니다. 서버로 전송하거나 저장하지 않습니다.

## 빠르게 실행하기

### Docker

```bash
docker compose up --build
```

또는 Docker 단독으로:

```bash
docker build -t myeongpan-world .
docker run --rm -p 3000:3000 myeongpan-world
```

http://localhost:3000 에서 열립니다.

### Cloud in a Bottle

`cloudinabottle.toml` 이 함께 들어 있습니다. 인증 없이 누구나 쓰는 공개 앱으로 선언돼 있습니다
(`routing.public_paths = ["/"]`).

### 로컬 개발

```bash
npm install
npm run dev
```

## 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 (standalone) |
| `npm start` | 빌드 결과 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run typecheck` | 타입 검사 |

## 기술 스택

- [Next.js](https://nextjs.org) App Router · React · TypeScript
- [Tailwind CSS](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com)
- Canvas 2D 렌더링 (`src/lib/nameplate.ts`)
- 본문 글꼴은 `next/font` 로 self-host 합니다.

## 구조

```
src/
├─ app/                  라우트와 전역 스타일
├─ components/
│  ├─ nameplate-studio.tsx   입력 폼과 미리보기
│  └─ ui/                    shadcn/ui 컴포넌트
└─ lib/
   ├─ nameplate.ts       명판 조판·렌더링 엔진
   └─ fonts.ts           글꼴 정의
```

## 라이선스

MIT — [LICENSE](LICENSE) 참고.

글꼴은 [나눔명조](https://fonts.google.com/specimen/Nanum+Myeongjo),
[고운바탕](https://fonts.google.com/specimen/Gowun+Batang),
[나눔고딕](https://fonts.google.com/specimen/Nanum+Gothic) 을 사용하며 각각 SIL Open Font License 를 따릅니다.
