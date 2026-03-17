"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { label: "Apps", href: "/apps" },
  { label: "Startups", href: "/startups" },
  { label: "Opportunities", href: "/opportunities" },
]

export function NavTabs() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <span className="text-lg font-semibold tracking-tight">ProductPulse</span>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
                pathname.startsWith(tab.href)
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
