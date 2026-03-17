"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"

type Props = {
  src: string | null
  alt: string
  size: number
  className?: string
}

// Safe image wrapper — uses next/image with fallback for unknown domains
export function SafeImage({ src, alt, size, className }: Props) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs", className)}
        style={{ width: size, height: size }}
      >
        {alt.charAt(0).toUpperCase()}
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-lg", className)}
      onError={() => setError(true)}
      unoptimized={!isKnownDomain(src)}
    />
  )
}

// Check if URL is from a domain we've configured in next.config.ts remotePatterns
function isKnownDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return [
      "is1-ssl.mzstatic.com", "is2-ssl.mzstatic.com", "is3-ssl.mzstatic.com",
      "is4-ssl.mzstatic.com", "is5-ssl.mzstatic.com",
      "play-lh.googleusercontent.com",
      "ph-files.imgix.net", "ph-avatars.imgix.net",
      "bookface-images.s3.amazonaws.com",
      "unikorn.vn",
    ].some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}
