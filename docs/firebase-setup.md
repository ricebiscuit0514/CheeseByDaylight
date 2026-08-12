# Firebase 실시간 점수판 설정

이 기능은 Firebase Realtime Database와 Anonymous Authentication을 사용합니다.
연동을 시작하지 않은 방문자는 Firebase에 연결되지 않습니다.

## 1. Firebase 프로젝트 만들기

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 생성합니다.
2. 프로젝트에 웹 앱을 추가합니다.
3. **Authentication → Sign-in method**에서 `Anonymous` 로그인을 활성화합니다.
4. **Realtime Database**를 만들고 서버 위치를 선택합니다.
5. 테스트 모드는 사용하지 말고 기본 잠금 상태를 유지합니다.

## 2. 로컬 환경 변수

`.env.example`을 참고해 저장소 루트에 `.env.local`을 만듭니다.

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY=
```

`NEXT_PUBLIC_*` 값은 빌드된 브라우저 코드에서 확인할 수 있습니다. Firebase 웹
API 키는 비밀 자격 증명이 아니며, 실제 권한은 `database.rules.json`과 App
Check가 통제합니다. 서비스 계정 키나 Admin SDK 비공개 키는 이 프로젝트에
추가하면 안 됩니다.

## 3. Security Rules 배포

Firebase CLI로 로그인한 뒤 프로젝트를 연결하고 Rules만 배포합니다.

```shell
npx firebase-tools login
npx firebase-tools use --add
npm run firebase:deploy:rules
```

Rules는 다음을 강제합니다.

- 데이터베이스 루트와 방 목록 조회 거부
- 익명 인증된 참가자의 유효한 비밀 방 읽기만 허용
- 방장 UID만 생성·수정·삭제 허용
- 48자 이상의 난수 방 토큰
- 선수 수, 문자열 길이, 킬 범위와 허용 필드 검증
- 방장 연결 종료 후 3시간까지만 재접속과 읽기 허용

## 4. App Check 설정

1. Firebase Console의 **App Check**에서 웹 앱을 등록합니다.
2. reCAPTCHA Enterprise 공급자를 선택하고 사이트 키를 발급합니다.
3. 사이트 키를 `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`에 넣습니다.
4. 배포 후 App Check 측정 화면에서 정상 요청이 들어오는지 확인합니다.
5. 확인이 끝난 뒤 Realtime Database와 Authentication의 적용을 활성화합니다.

App Check는 자동화된 외부 요청을 줄이는 보조 장치입니다. 방장 권한은 항상
Security Rules의 Firebase Auth UID 검사로 결정됩니다.
프로덕션에서 App Check 사이트 키가 빠지면 연동 시작을 거부하도록 구현되어
있으므로, Vercel Production 환경 변수 등록을 반드시 완료해야 합니다.

## 5. 허용 도메인과 Vercel

Authentication의 **Authorized domains**에 다음을 등록합니다.

- 로컬 개발용 `localhost`
- 실제 Vercel 프로덕션 도메인
- 사용하는 경우 커스텀 도메인

Vercel 프로젝트의 Production, Preview, Development 환경에 `.env.local`과
같은 환경 변수를 등록합니다. Preview 도메인을 모두 허용하면 공격 표면이
넓어지므로, 실시간 연동 검증에 필요한 도메인만 등록하는 것을 권장합니다.

## 6. 운영 확인

- Spark 플랜은 Realtime Database 동시 연결 100개가 한도입니다.
- 브라우저 탭 하나가 일반적으로 연결 하나를 사용합니다.
- 호스트 1명과 참가자 7명은 약 8개 연결을 사용합니다.
- 같은 브라우저 프로필에서는 BroadcastChannel과 storage 이벤트로 가장 최근
  Firebase 탭 하나만 유지합니다. 별도 프로필·기기까지 막는 장치는 아닙니다.
- Firebase Console의 Usage 화면에서 동시 연결과 다운로드 사용량을 확인합니다.
- 점수판 연동 종료 후 다시 시작하면 새 링크가 발급되며, 기존 참가자 연결은 종료됩니다.
- 방장 탭이나 브라우저가 닫히면 참가자는 최대 3시간 재접속을 기다린 뒤
  자동으로 로컬 점수판으로 돌아가며 Firebase 연결 슬롯을 반환합니다.
- 점수판의 로컬 `localStorage` 복구 시간은 3시간입니다.

## 7. 로컬 보안 규칙 테스트

Firebase Emulator 실행에는 Java 21 이상이 필요합니다.

```shell
npm run test:rules
```

테스트는 방장 쓰기, 참가자 읽기, 참가자 쓰기 거부, 방 목록 조회 거부, 잘못된
점수 거부, 방장 이탈 후 3시간 접근 종료를 실제 Realtime Database Emulator에서
확인합니다.
