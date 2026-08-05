import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Black_Han_Sans } from 'next/font/google'
import './globals.css'

// Black Han Sans는 ALL KILL 워터마크 전용
const blackHanSans = Black_Han_Sans({ weight: '400', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Cheese By Daylight | 치즈 바이 데이라이트',
  description: '데드 바이 데이라이트 커스텀 게임 진행 보조 프로그램입니다.',
  keywords: ['cheesebydaylight', 'cheese by Daylight', '치즈바이데이라이트', '치즈 바이 데이라이트', '치바데'],
  applicationName: 'Cheese by Daylight',
  authors: [{ name: 'Cheese by Daylight' }],
  openGraph: {
    title: 'Cheese By Daylight | 치즈 바이 데이라이트',
    description: '데드 바이 데이라이트 커스텀 게임 진행 보조 프로그램입니다.',
    siteName: 'Cheese by Daylight',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cheese By Daylight | 치즈 바이 데이라이트',
    description: '데드 바이 데이라이트 커스텀 게임 진행 보조 프로그램입니다.',
  },
  robots: {
    index: true,
    follow: true,
  },
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
        {/* Fixed Global Background — Never moves or resizes on page transitions */}
        <div className="fixed inset-0 trial-arena pointer-events-none z-0 overflow-hidden" aria-hidden="true">
          <div className="arena-fog" />
          <div className="arena-scratches" />
          <div className="arena-axis" />
        </div>
        <div className="relative z-10">
          {children}
        </div>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
