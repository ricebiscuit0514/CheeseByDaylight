export function getRequestOrigin(requestHeaders: Headers) {
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  if (!host) return null

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https"
  return `${protocol}://${host}`
}
