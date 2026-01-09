# 🚀 배포 가이드

## 옵션 1: Google Cloud Run (추천)

### 사전 준비
1. [Google Cloud Console](https://console.cloud.google.com) 계정
2. `gcloud` CLI 설치

### 배포 단계

```bash
# 1. 빌드
npm run build

# 2. GCP 프로젝트 설정
gcloud config set project YOUR_PROJECT_ID

# 3. Cloud Run에 배포
gcloud run deploy jandi-room-bot \
  --source . \
  --platform managed \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "JANDI_OUTGOING_TOKEN=your-token" \
  --set-env-vars "GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email" \
  --set-env-vars "GOOGLE_PRIVATE_KEY=your-key"
```

### 비용
- **무료 티어**: 월 200만 요청, 360,000 GB-초
- 소규모 팀은 거의 무료

---

## 옵션 2: Railway (가장 간단)

### 배포 단계

1. [Railway](https://railway.app) 가입
2. GitHub 연동
3. "New Project" → "Deploy from GitHub"
4. 환경 변수 설정:
   ```
   JANDI_OUTGOING_TOKEN=your-token
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-email
   GOOGLE_PRIVATE_KEY=your-key
   ```

### 비용
- **무료**: 월 $5 크레딧 (충분함)
- Hobby: 월 $5

---

## 옵션 3: Vercel (서버리스)

### 설정 파일 추가

```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/index.js"
    }
  ]
}
```

### 배포
```bash
npm run build
npx vercel --prod
```

---

## 옵션 4: AWS Lambda + API Gateway

### serverless.yml 예시

```yaml
service: jandi-room-bot

provider:
  name: aws
  runtime: nodejs20.x
  region: ap-northeast-2

functions:
  webhook:
    handler: dist/lambda.handler
    events:
      - http:
          path: /jandi/command
          method: post
      - http:
          path: /jandi/health
          method: get
```

---

## 옵션 5: 자체 서버 (24/7 운영)

### PM2로 프로세스 관리

```bash
# PM2 설치
npm install -g pm2

# 서버 시작 (자동 재시작)
pm2 start dist/index.js --name jandi-bot

# 시스템 부팅 시 자동 시작
pm2 startup
pm2 save

# 로그 확인
pm2 logs jandi-bot

# 상태 확인
pm2 status
```

### Nginx 리버스 프록시 (HTTPS)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔧 환경 변수 체크리스트

배포 전 반드시 설정:

| 변수 | 필수 | 설명 |
|------|------|------|
| `JANDI_OUTGOING_TOKEN` | ✅ | 잔디 웹훅 토큰 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ | Google 서비스 계정 |
| `GOOGLE_PRIVATE_KEY` | ✅ | Google 프라이빗 키 |
| `DATABASE_PATH` | ❌ | DB 경로 (기본: ./data/bookings.db) |
| `ADMIN_API_KEY` | ❌ | 관리자 API 키 |

---

## 📌 잔디 웹훅 URL 설정

배포 후 받은 URL을 잔디에 등록:

```
https://your-service-url.com/jandi/command
```

예시:
- Cloud Run: `https://jandi-room-bot-xxxxx-an.a.run.app/jandi/command`
- Railway: `https://jandi-room-bot.up.railway.app/jandi/command`
- Vercel: `https://jandi-room-bot.vercel.app/jandi/command`

