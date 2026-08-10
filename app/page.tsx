"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { motion, AnimatePresence } from "motion/react"
import { AppVersion } from "@/components/app-version"
import { createCheeseBurst, type CheeseParticle } from "@/components/cheese-burst"

export default function LandingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [cheeses, setCheeses] = useState<CheeseParticle[]>([])

  useEffect(() => {
    // 만약 사용자가 URL에 ?select=true 를 지정했으면 자동 리다이렉트 안함 (모드 변경용)
    const params = new URLSearchParams(window.location.search)
    if (params.get("select") === "true") {
      setChecking(false)
      return
    }

    try {
      const lastMode = localStorage.getItem("dbd-last-mode")
      const lastTimeRaw = localStorage.getItem("dbd-last-mode-time")
      const lastTime = lastTimeRaw ? parseInt(lastTimeRaw, 10) : 0
      const EXPIRATION_TIME_MS = 60 * 60 * 1000 // 1시간 만료 쿨타임

      // 1시간 이내에 방문/조작 이력이 있을 때만 이전 개임 모드로 자동 연결
      if (lastMode && lastTime && Date.now() - lastTime < EXPIRATION_TIME_MS) {
        if (lastMode === "4v4") {
          router.replace("/4v4")
          return
        }
        if (lastMode === "1v4" || lastMode === "5v1") {
          router.replace("/1v4")
          return
        }
      }
    } catch {
      // localStorage 불가 시 메인 화면 표시
    }
    setChecking(false)
  }, [router])

  const handleSelectMode = (mode: "4v4" | "1v4") => {
    try {
      localStorage.setItem("dbd-last-mode", mode)
      localStorage.setItem("dbd-last-mode-time", Date.now().toString())
    } catch {
      // 무시
    }
    router.push(`/${mode}`)
  }

  // 이스터에그: 로고 클릭 시 마우스 커서 위치에서 치즈 이모지 팝! 💥🧀
  const handleLogoClick = (e: React.MouseEvent<HTMLImageElement>) => {
    setCheeses((prev) => [
      ...prev.slice(-30),
      ...createCheeseBurst(e.clientX, e.clientY),
    ])
  }

  // 리다이렉트 여부 검사 중 깜빡임 방지
  if (checking) {
    return (
      <main className="min-h-screen w-full bg-black flex items-center justify-center select-none">
        <div className="size-8 rounded-full border-2 border-dbd-yellow border-t-transparent animate-spin" />
      </main>
    )
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden text-foreground flex flex-col items-center justify-center p-4 select-none">
      {/* 치즈 이모지 폭발 팝업 레이어 🧀 */}
      <AnimatePresence>
        {cheeses.map((c) => (
          <motion.span
            key={c.id}
            initial={{
              x: c.x,
              y: c.y,
              scale: 0,
              rotate: 0,
              opacity: 1,
            }}
            animate={{
              x: c.x + c.targetX,
              y: c.y + c.targetY,
              scale: [0, 1.5, 1.0, 0],
              rotate: c.rotation,
              opacity: [0, 1, 0.9, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: c.duration,
              ease: [0.12, 0.8, 0.32, 1],
            }}
            onAnimationComplete={() => {
              setCheeses((prev) => prev.filter((p) => p.id !== c.id))
            }}
            className="fixed top-0 left-0 z-[999] pointer-events-none select-none drop-shadow-sm -translate-x-1/2 -translate-y-1/2"
            style={{ fontSize: `${c.size}rem` }}
          >
            🧀
          </motion.span>
        ))}
      </AnimatePresence>

      {/* DBD Scratch & Fog Atmosphere */}
      <div className="arena-fog opacity-35 pointer-events-none" aria-hidden="true" />
      <div className="arena-scratches opacity-25 pointer-events-none" aria-hidden="true" />

      {/* Landing feature art */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-[5] flex items-center justify-end pe-16 sm:pe-24 md:pe-32 -translate-y-6 sm:-translate-y-8 md:-translate-y-10"
        aria-hidden="true"
      >
        <Image
          src="/images/Fearlesslandingart.webp"
          alt=""
          width={720}
          height={900}
          className="pointer-events-auto h-[min(66vh,615px)] w-auto max-w-[min(43.5vw,570px)] object-contain object-right transition-transform duration-300 hover:scale-105"
          priority
        />
      </div>

      {/* Main Center Content Box */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-6 md:space-y-8 max-w-2xl w-full">
        
        {/* Original Cheese Skull Logo Image (Clickable Cheese Easter Egg!) */}
        <div className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl h-auto flex items-center justify-center px-2">
          <Image
            src="/images/cheese-skull-logo.webp"
            alt="Cheese by Daylight"
            width={600}
            height={360}
            onClick={handleLogoClick}
            className="w-[320px] sm:w-[420px] md:w-[500px] h-auto object-contain mix-blend-screen drop-shadow-[0_0_30px_rgba(234,179,8,0.35)] transition-transform duration-300 hover:scale-105 cursor-pointer active:scale-95"
            priority
          />
        </div>

        {/* Mode Selection Buttons */}
        <div className="flex flex-col items-center space-y-4 w-full">
          <button
            type="button"
            onClick={() => handleSelectMode("4v4")}
            className="w-56 sm:w-64 md:w-72 py-3 px-6 bg-black/60 hover:bg-black/85 border border-white/40 hover:border-white text-white rounded-none font-bold text-base sm:text-lg tracking-wider shadow-2xl backdrop-blur-md transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer flex items-center justify-center"
            style={{ fontFamily: "var(--font-godo)" }}
          >
            4 vs 4 모드
          </button>

          {/* 5-Player Mode Button */}
          <button
            type="button"
            onClick={() => handleSelectMode("1v4")}
            className="w-56 sm:w-64 md:w-72 py-3 px-6 bg-black/60 hover:bg-black/85 border border-white/40 hover:border-white text-white rounded-none font-bold text-base sm:text-lg tracking-wider shadow-2xl backdrop-blur-md transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer flex items-center justify-center"
            style={{ fontFamily: "var(--font-godo)" }}
          >
            5인 내전 모드
          </button>
        </div>

      </div>

      {/* Bottom Center Semi-Transparent Unofficial Disclaimer Notice */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center hidden sm:block">
        <p
          className="text-[11px] sm:text-[12px] text-neutral-500/60 tracking-wide whitespace-nowrap"
          style={{ fontFamily: "var(--font-s-core)", fontWeight: 300 }}
        >
          치지직 및 데드 바이 데이라이트와 관련이 없는 비공식 프로그램입니다
        </p>
      </div>

      {/* Bottom Right Footer Info Section */}
      <footer className="absolute bottom-5 right-6 md:bottom-7 md:right-8 z-20 flex flex-col items-end text-right space-y-2 pointer-events-auto select-none">
        {/* Program Description */}
        <p
          className="text-[11px] sm:text-[12px] text-neutral-300/90 leading-tight max-w-xs sm:max-w-none"
          style={{ fontFamily: "var(--font-s-core)", fontWeight: 300 }}
        >
          <span className="text-[#fcbf30] text-[13px] sm:text-[15px] inline-block mr-1">치즈 바이 데이라이트 | 치바데</span>
          는 데드 바이 데이라이트 커스텀 게임 진행 보조 프로그램입니다
        </p>

        {/* GitHub Logo & Link */}
        <a
          href="https://github.com/ricebiscuit0514/CheeseByDaylight"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 group transition-opacity hover:opacity-100 opacity-80 mt-1"
          aria-label="GitHub Repository"
        >
          <Image
            src="/images/github-logo.png"
            alt="GitHub"
            width={110}
            height={28}
            className="h-4 sm:h-5 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
          />
        </a>

        <AppVersion className="pt-0.5" />
      </footer>
    </main>
  )
}
