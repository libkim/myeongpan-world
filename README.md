# 명판월드

사업자등록증에 적힌 내용을 입력하면 **배경이 투명한 사업자명판 이미지**를 만들어 주는 웹앱입니다.
계약서·신청서의 명판 칸에 그대로 얹어 쓸 수 있습니다.

## 특징

- **서식 칸에 맞춘 배치** — 영수증·세금계산서·거래명세표 공급자란을 실측해 평균 낸 칸 비율로
  사업자번호 / 상호·성명 / 사업장 소재지 / 업태·종목을 배치합니다. 네 행 높이는 같습니다.
- **글자 맞춤 순서** — 칸보다 글이 길면 자간을 먼저 좁히고, 최소 자간에 닿으면 장평을 줄이고,
  최소 장평에도 닿았을 때만 글자 크기를 줄입니다. 그래도 최소 글자 크기보다 작아지면
  상호·소재지·업태·종목은 두 줄로 나눕니다. 띄어쓰기에서 끊는 것이 기본이고, 그렇게 끊었을 때
  짧은 줄이 긴 줄의 40%에 못 미치면 단어 중간에서 끊습니다. 숫자·영문이 이어지는 사이나
  닫는 문장부호 앞에서는 끊지 않습니다.
- **투명 배경 PNG** — 도장처럼 문서 위에 바로 겹쳐 쓸 수 있습니다.
- **인영 스타일 다섯 가지** — 모두 고무인을 종이에 찍은 흔적을 흉내 냅니다.
  - 거친 인영: 테두리 요철·잉크 고임·압력 얼룩·흰 점·종이 결
  - 새김 인영: 글자까지의 거리장(SDF)으로 모양을 흔들어 테두리가 매끈하고 선명함
  - 수채: 조금씩 다르게 일그러진 반투명 층을 겹쳐 둘레에 물 자국이 남음
  - 목탄: 종이 결의 돌기에만 잉크가 걸리는 거친 질감
  - 스프레이: 글자 둘레로 잉크 알갱이가 흩뿌려짐
- **최소한의 설정** — 가로 길이, 잉크 색(감청·먹·인주), 글꼴(나눔명조·고운바탕·나눔고딕),
  인영 스타일, 재생성(반듯하게 / 랜덤하게)만 고릅니다. 반듯하게는 항상 같은 인영이 똑바로 찍히고,
  랜덤하게는 누를 때마다 인영 모양과 기울기(±0.5~1.5°)를 새로 뽑습니다. 나머지는 서식 기준에 맞춰 고정돼 있습니다.
- **실시간 미리보기** — 종이 배경과 투명 격자를 오가며 확인할 수 있습니다.
- **600dpi 출력** — 인쇄와 문서 합성에 충분한 해상도로 내보냅니다.
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
