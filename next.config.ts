import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 同じWi-Fi内のスマートフォンから開発画面を操作できるようにする。
  // 開発用リソースだけに適用され、インターネット公開は行わない。
  allowedDevOrigins: ["192.168.0.4", "127.0.0.1", "localhost"],
};

export default nextConfig;
