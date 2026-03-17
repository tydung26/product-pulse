import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Apple App Store icons
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      // Google Play icons
      { protocol: "https", hostname: "play-lh.googleusercontent.com" },
      // Product Hunt thumbnails
      { protocol: "https", hostname: "ph-files.imgix.net" },
      { protocol: "https", hostname: "ph-avatars.imgix.net" },
      // YC
      { protocol: "https", hostname: "bookface-images.s3.amazonaws.com" },
      // Unikorn
      { protocol: "https", hostname: "unikorn.vn" },
    ],
  },
};

export default nextConfig;
