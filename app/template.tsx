"use client"

import { motion, AnimatePresence } from "motion/react"
import { usePathname } from "next/navigation"

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Determine direction based on route
  const is5v1 = pathname === "/5v1"
  const is4v4 = pathname === "/4v4"

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: is5v1 ? 45 : is4v4 ? -45 : 0 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: is5v1 ? -45 : is4v4 ? 45 : 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full min-h-screen overflow-hidden"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
