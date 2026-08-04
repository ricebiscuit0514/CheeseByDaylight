import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Black_Han_Sans } from 'next/font/google'
import './globals.css'

// Black Han Sans는 ALL KILL 워터마크 전용
const blackHanSans = Black_Han_Sans({ weight: '400', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Dead by Daylight 스코어보드',
  description: '데드 바이 데이라이트 팀 스코어보드',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={`dark ${blackHanSans.className}`} style={{ "--font-black-han": blackHanSans.style.fontFamily } as React.CSSProperties}>
      <body className="bg-background antialiased" style={{ fontFamily: "var(--font-godo)" }}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
