import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 컨테이너 이미지를 작게 유지하기 위해 독립 실행 번들로 빌드한다.
  output: "standalone",
  // 상위 디렉터리의 lock 파일을 끌어오지 않도록 프로젝트 경로를 고정한다.
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
