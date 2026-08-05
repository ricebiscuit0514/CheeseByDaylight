"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

export default function LandingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // 만약 사용자가 URL에 ?select=true 를 지정했으면 자동 리다이렉트 안함 (모드 변경용)
    const params = new URLSearchParams(window.location.search)
    if (params.get("select") === "true") {
      setChecking(false)
      return
    }

    try {
      const lastMode = localStorage.getItem("dbd-last-mode")
      if (lastMode === "4v4") {
        router.replace("/4v4")
        return
      }
      if (lastMode === "5v1") {
        router.replace("/5v1")
        return
      }
    } catch {
      // localStorage 불가 시 메인 화면 표시
    }
    setChecking(false)
  }, [router])

  const handleSelectMode = (mode: "4v4" | "5v1") => {
    try {
      localStorage.setItem("dbd-last-mode", mode)
    } catch {
      // 무시
    }
    router.push(`/${mode}`)
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
      {/* 1. Balanced & Darkened Blurred Background */}
      <div 
        className="absolute -inset-10 bg-cover bg-center filter blur-[8px] scale-110 transition-all duration-700 pointer-events-none" 
        style={{ backgroundImage: "url('/images/lullaby-of-the-dark-key-art.png')" }} 
        aria-hidden="true" 
      />
      {/* Ambient Dark Overlay + Vignette */}
      <div className="absolute inset-0 bg-black/65" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.9)_100%)] pointer-events-none" aria-hidden="true" />

      {/* DBD Scratch & Fog Atmosphere */}
      <div className="arena-fog opacity-35 pointer-events-none" aria-hidden="true" />
      <div className="arena-scratches opacity-25 pointer-events-none" aria-hidden="true" />

      {/* Main Center Content Box */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-6 md:space-y-8 max-w-2xl w-full">
        
        {/* Original Cheese Skull Logo Image */}
        <div className="relative w-full max-w-lg sm:max-w-xl md:max-w-2xl h-auto flex items-center justify-center px-2">
          <Image
            src="/images/cheese-skull-logo.png"
            alt="Cheese by Daylight"
            width={600}
            height={360}
            className="w-[320px] sm:w-[420px] md:w-[500px] h-auto object-contain mix-blend-screen drop-shadow-[0_0_30px_rgba(234,179,8,0.35)] transition-transform duration-300 hover:scale-105"
            priority
          />
        </div>

        {/* Mode Selection Buttons */}
        <div className="flex flex-col items-center space-y-4 w-full">
          {/* 4 vs 4 Mode Button */}
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
            onClick={() => handleSelectMode("5v1")}
            className="w-56 sm:w-64 md:w-72 py-3 px-6 bg-black/60 hover:bg-black/85 border border-white/40 hover:border-white text-white rounded-none font-bold text-base sm:text-lg tracking-wider shadow-2xl backdrop-blur-md transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer flex items-center justify-center"
            style={{ fontFamily: "var(--font-godo)" }}
          >
            5인 내전 모드
          </button>
        </div>

      </div>

      {/* Bottom Center Semi-Transparent Unofficial Disclaimer Notice */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center hidden sm:block">
        <p className="text-[11px] sm:text-[12px] text-neutral-500/60 font-medium tracking-wide whitespace-nowrap" style={{ fontFamily: "var(--font-godo)" }}>
          본 사이트는 치지직 및 데드 바이 데이라이트와 관련이 없는 비공식 팬메이드 사이트입니다.
        </p>
      </div>

      {/* Bottom Right Footer Info Section */}
      <footer className="absolute bottom-5 right-6 md:bottom-7 md:right-8 z-20 flex flex-col items-end text-right space-y-2 pointer-events-auto select-none">
        {/* Program Description */}
        <p className="text-[11px] sm:text-[12px] text-neutral-300/90 leading-tight font-normal max-w-xs sm:max-w-none" style={{ fontFamily: "var(--font-godo)" }}>
          <span className="text-[#fcbf30] font-bold">치즈 바이 데이라이트(치바데)</span>는 데드 바이 데이라이트 커스텀 게임 진행 보조 사이트입니다
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

        {/* Version Number */}
        <span className="text-xs sm:text-sm text-neutral-400/90 font-mono tracking-wider pt-0.5">
          v1.0.0
        </span>
      </footer>
    </main>
  )
}
