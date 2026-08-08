const INVITE_TITLE = "치즈 바이 데이라이트 | 점수판 연동하기"
const INVITE_DESCRIPTION = "진행자의 실시간 점수판에 참가합니다."

export function JoinInviteLanding() {
  return (
    <main className="mx-auto flex min-h-[40vh] max-w-lg flex-col justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">{INVITE_TITLE}</h1>
      <p className="text-sm text-muted-foreground">{INVITE_DESCRIPTION}</p>
    </main>
  )
}
