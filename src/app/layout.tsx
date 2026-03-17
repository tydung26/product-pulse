import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { NavTabs } from "@/components/nav-tabs"
import "./globals.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "ProductPulse",
  description: "Monitor app reviews, track startups, surface product opportunities",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <NavTabs />
        <main className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
