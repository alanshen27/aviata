import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bullmq", "ioredis"],
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
};

export default nextConfig;
