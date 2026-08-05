import Link from "next/link"

export default function LandingPage() {
  return (
    <main className="trial-arena relative min-h-screen w-full overflow-hidden text-foreground flex flex-col items-center justify-center p-4">
      {/* DBD Visual Effects Background */}
      <div className="arena-fog" aria-hidden="true" />
      <div className="arena-scratches" aria-hidden="true" />
      <div className="arena-axis" aria-hidden="true" />

      <div className="relative z-10 max-w-lg w-full bg-black/60 backdrop-blur-md rounded-lg shadow-2xl p-8 border border-neutral-800 flex flex-col items-center space-y-8">
        
        {/* Title Header */}
        <div className="w-full flex flex-col items-center justify-center">
          {/* Logo placeholder - replace src when actual logo is provided */}
          <div className="w-48 h-48 bg-black/70 rounded-full flex items-center justify-center shadow-2xl border-4 border-dbd-yellow/60 overflow-hidden relative mb-4">
             <div className="absolute inset-0 bg-dbd-orange/20 blur-xl"></div>
             <span
               className="text-dbd-yellow font-black italic text-3xl z-10 text-center leading-tight drop-shadow-[0_4px_12px_rgba(234,179,8,0.5)]"
               style={{ fontFamily: "var(--font-aldrich)" }}
             >
               CHEESE<br />BY<br />DAYLIGHT
             </span>
          </div>

          <h1
            className="text-3xl font-bold italic text-dbd-orange drop-shadow-md text-center mt-2"
            style={{ fontFamily: "var(--font-aldrich)" }}
          >
            GAME MODE SELECT
          </h1>
          <p className="text-sm text-neutral-400 mt-1" style={{ fontFamily: "var(--font-godo)" }}>
            원하시는 게임 모드를 선택해 주세요
          </p>
        </div>
        
        {/* Buttons */}
        <div className="flex flex-col w-full space-y-4 pt-2">
          <Link href="/4v4" className="w-full">
            <button
              type="button"
              className="w-full py-4 bg-black/80 hover:bg-dbd-orange/20 border border-dbd-orange/70 text-dbd-orange rounded-md font-bold text-lg shadow-xl backdrop-blur-sm transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center space-x-3 cursor-pointer"
              style={{ fontFamily: "var(--font-godo)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>4 vs 4 데바데 모드</span>
            </button>
          </Link>

          <Link href="/5v1" className="w-full">
            <button
              type="button"
              className="w-full py-4 bg-black/80 hover:bg-dbd-yellow/20 border border-dbd-yellow/70 text-dbd-yellow rounded-md font-bold text-lg shadow-xl backdrop-blur-sm transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center space-x-3 cursor-pointer"
              style={{ fontFamily: "var(--font-godo)" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>5인 내전 모드 (1 vs 4)</span>
            </button>
          </Link>
        </div>

      </div>
    </main>
  )
}
