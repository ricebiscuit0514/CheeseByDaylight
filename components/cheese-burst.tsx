"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"

export type CheeseParticle = {
  id: number
  x: number
  y: number
  targetX: number
  targetY: number
  rotation: number
  size: number
  duration: number
}

export function createCheeseBurst(clickX: number, clickY: number): CheeseParticle[] {
  const count = 14 + Math.floor(Math.random() * 6)
  return Array.from({ length: count }).map((_, index) => {
    const angle = (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.6
    const distance = 60 + Math.random() * 140
    return {
      id: Date.now() + index + Math.random(),
      x: clickX,
      y: clickY,
      targetX: Math.cos(angle) * distance,
      targetY: Math.sin(angle) * distance - (20 + Math.random() * 60),
      rotation: (Math.random() - 0.5) * 720,
      size: 0.55 + Math.random() * 0.65,
      duration: 0.7 + Math.random() * 0.6,
    }
  })
}

function CheeseBurstOverlay({
  cheeses,
  onRemove,
}: {
  cheeses: CheeseParticle[]
  onRemove: (id: number) => void
}) {
  return (
    <AnimatePresence>
      {cheeses.map((particle) => (
        <motion.span
          key={particle.id}
          initial={{
            x: particle.x,
            y: particle.y,
            scale: 0,
            rotate: 0,
            opacity: 1,
          }}
          animate={{
            x: particle.x + particle.targetX,
            y: particle.y + particle.targetY,
            scale: [0, 1.5, 1, 0],
            rotate: particle.rotation,
            opacity: [0, 1, 0.9, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration: particle.duration,
            ease: [0.12, 0.8, 0.32, 1],
          }}
          onAnimationComplete={() => onRemove(particle.id)}
          className="fixed top-0 left-0 z-[9999] pointer-events-none select-none drop-shadow-sm -translate-x-1/2 -translate-y-1/2"
          style={{ fontSize: `${particle.size}rem` }}
        >
          🧀
        </motion.span>
      ))}
    </AnimatePresence>
  )
}

export function useCheeseBurst() {
  const [mounted, setMounted] = useState(false)
  const [cheeses, setCheeses] = useState<CheeseParticle[]>([])

  useEffect(() => setMounted(true), [])

  const burst = useCallback((clientX: number, clientY: number) => {
    setCheeses((previous) => [
      ...previous.slice(-30),
      ...createCheeseBurst(clientX, clientY),
    ])
  }, [])

  const removeParticle = useCallback((id: number) => {
    setCheeses((previous) => previous.filter((particle) => particle.id !== id))
  }, [])

  const layer =
    mounted && cheeses.length > 0
      ? createPortal(
          <CheeseBurstOverlay cheeses={cheeses} onRemove={removeParticle} />,
          document.body,
        )
      : null

  return { burst, layer }
}
