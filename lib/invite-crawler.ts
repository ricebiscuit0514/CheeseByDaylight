const INVITE_CRAWLER_PATTERN =
  /discordbot|facebookexternalhit|twitterbot|slackbot|linkedinbot|telegrambot|whatsapp|embedly|quora link preview|vkshare|w3c_validator/i

export function isInviteCrawler(userAgent: string | null | undefined) {
  if (!userAgent) return false
  return INVITE_CRAWLER_PATTERN.test(userAgent)
}
