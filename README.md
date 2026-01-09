# 🏢 JANDI 회의실 예약 봇

잔디(JANDI) 메신저와 Google Calendar를 연동하여 회의실 예약을 관리하는 봇입니다.

## ✨ 주요 기능

- **회의실 예약**: 잔디 채팅에서 직접 회의실 예약
- **현황 조회**: 실시간 회의실 가용성 확인
- **예약 관리**: 예약 취소, 변경, 연장
- **자동 알림**: 회의 시작 전 알림, 노쇼 감지 등

## 🏗️ 아키텍처

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   JANDI     │────▶│  Booking Bot     │────▶│ Google Calendar │
│ (Outgoing)  │◀────│  (Node.js)       │◀────│     API         │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   SQLite     │
                    │  (예약 DB)   │
                    └──────────────┘
```

## 📋 지원 명령어

### 현황 조회
```
room status                    # 오늘 전체 현황
room status today              # 오늘 현황
room status 2026-01-07         # 특정 날짜 현황
room status 09:00-18:00        # 특정 시간대 현황
```

### 예약 생성
```
room book <회의실> <날짜> <시작시간> <길이(분)> "<제목>"
room book A 2026-01-07 14:00 60 "주간회의"
room book A today 14:00 60 "주간회의"
```

### 예약 관리
```
room cancel <예약ID>           # 예약 취소
room move <예약ID> <새날짜> <새시작시간>  # 시간 변경
room extend <예약ID> <추가분>   # 시간 연장
```

### 조회
```
room my                        # 내 전체 예약
room my today                  # 오늘 내 예약
room my week                   # 이번 주 내 예약
room list                      # 회의실 목록
room list 2026-01-07           # 특정 날짜 전체 예약
```

### 도움말
```
room help                      # 명령어 도움말
```

## 🚀 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 설정

```bash
# 샘플 파일 복사
cp env.sample .env

# .env 파일 편집하여 실제 값 입력
```

### 3. 데이터베이스 초기화

```bash
npm run db:init
```

### 4. 개발 서버 실행

```bash
npm run dev
```

### 5. 프로덕션 빌드 및 실행

```bash
npm run build
npm start
```

## ⚙️ 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `PORT` | 서버 포트 (기본: 3000) | ❌ |
| `NODE_ENV` | 실행 환경 | ❌ |
| `JANDI_OUTGOING_TOKEN` | 잔디 Outgoing Webhook 토큰 | ✅ |
| `JANDI_INCOMING_WEBHOOK_URL` | 잔디 Incoming Webhook URL | ❌ |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google 서비스 계정 이메일 | ✅* |
| `GOOGLE_PRIVATE_KEY` | Google 서비스 계정 프라이빗 키 | ✅* |
| `GOOGLE_CALENDAR_TIMEZONE` | 타임존 (기본: Asia/Seoul) | ❌ |
| `DATABASE_PATH` | SQLite DB 경로 | ❌ |

*OAuth 사용 시 대체 가능

## 🔗 잔디 설정 방법

### 1. Team Outgoing Webhook 생성

1. 잔디 관리자 페이지 접속
2. 커넥트 > Outgoing Webhook 선택
3. 설정:
   - **트리거 워드**: `room`
   - **URL**: `https://your-server.com/jandi/command`
   - **토큰**: 발급된 토큰을 `.env`에 설정

### 2. Google Calendar 커넥트 (선택)

알림 자동 수신을 위해 잔디의 Google Calendar 앱을 연동합니다.

### 3. Incoming Webhook (선택)

맞춤 알림을 위해 Incoming Webhook을 생성하고 URL을 `.env`에 설정합니다.

## 🔐 Google Calendar API 설정

### 서비스 계정 방식 (권장)

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 프로젝트 생성
3. Calendar API 활성화
4. 서비스 계정 생성 및 키 다운로드
5. Google Workspace에서 도메인 위임 설정
6. `.env`에 인증 정보 설정

### OAuth 방식

1. OAuth 2.0 클라이언트 ID 생성
2. 리프레시 토큰 발급
3. `.env`에 인증 정보 설정

## 📁 프로젝트 구조

```
jandiwephook/
├── src/
│   ├── config/          # 설정 관리
│   ├── routes/          # Express 라우터
│   │   ├── webhook.ts   # 잔디 웹훅 엔드포인트
│   │   └── admin.ts     # 관리자 API
│   ├── services/        # 비즈니스 로직
│   │   ├── database.ts      # SQLite 서비스
│   │   ├── googleCalendar.ts # Google Calendar API
│   │   ├── commandParser.ts  # 명령어 파서
│   │   ├── commandHandler.ts # 명령어 처리
│   │   └── jandiNotifier.ts  # 잔디 알림 서비스
│   ├── types/           # TypeScript 타입 정의
│   ├── utils/           # 유틸리티
│   ├── scripts/         # 스크립트
│   └── index.ts         # 서버 엔트리포인트
├── data/                # SQLite 데이터베이스
├── logs/                # 로그 파일
├── package.json
├── tsconfig.json
└── README.md
```

## 🔌 API 엔드포인트

### 웹훅
- `POST /jandi/command` - 잔디 Outgoing Webhook 수신
- `GET /jandi/health` - 헬스 체크

### 관리자 API (X-API-Key 헤더 필요)
- `GET /admin/rooms` - 회의실 목록
- `POST /admin/rooms` - 회의실 등록
- `PUT /admin/rooms/:id` - 회의실 수정
- `GET /admin/bookings` - 예약 목록
- `GET /admin/bookings/:bookingId` - 예약 상세
- `GET /admin/logs` - 감사 로그
- `GET /admin/stats` - 통계

## 🛠️ 개발

```bash
# 개발 모드 (자동 리로드)
npm run dev

# 타입 체크
npx tsc --noEmit

# 빌드
npm run build
```

## 📝 라이선스

ISC

## 👨‍💻 기여

이슈 및 PR 환영합니다!

