import { Gowun_Batang, Nanum_Gothic, Nanum_Myeongjo } from "next/font/google";

// Google 이 한글 폰트를 unicode-range 단위로 쪼개 주므로 latin 만 지정해도 한글이 따라온다.
// 본문이 아니라 캔버스에서만 쓰므로 preload 를 끄고, 실제 입력한 글자에 해당하는 조각만 내려받는다.
const nanumMyeongjo = Nanum_Myeongjo({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
  variable: "--font-nanum-myeongjo",
});

const gowunBatang = Gowun_Batang({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
  variable: "--font-gowun-batang",
});

const nanumGothic = Nanum_Gothic({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
  variable: "--font-nanum-gothic",
});

export const fontVariables = [
  nanumMyeongjo.variable,
  gowunBatang.variable,
  nanumGothic.variable,
].join(" ");

export interface FontOption {
  id: string;
  label: string;
  hint: string;
  family: string;
}

/** 캔버스에 그대로 넘길 실제 font-family 문자열. */
export const FONT_OPTIONS: FontOption[] = [
  {
    id: "nanum-myeongjo",
    label: "나눔명조",
    hint: "관공서·금융 서류에 무난한 명조체",
    family: nanumMyeongjo.style.fontFamily,
  },
  {
    id: "gowun-batang",
    label: "고운바탕",
    hint: "획이 가늘고 단정한 바탕체",
    family: gowunBatang.style.fontFamily,
  },
  {
    id: "nanum-gothic",
    label: "나눔고딕",
    hint: "작게 찍어도 또렷한 고딕체",
    family: nanumGothic.style.fontFamily,
  },
];
