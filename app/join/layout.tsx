import type { Metadata } from "next"

// Invite links should render compact Discord embeds (title + description only).
export const metadata: Metadata = {
  twitter: {
    card: "summary",
  },
}

export default function JoinLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
