# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# 패키지 파일 복사 및 설치 (devDependencies 포함)
COPY package*.json ./
RUN npm ci

# 소스 코드 복사 및 빌드
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# 패키지 파일 복사 및 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --only=production

# 빌드된 파일 복사
COPY --from=builder /app/dist ./dist

# 데이터 디렉토리 생성
RUN mkdir -p ./data

# 환경 변수 설정
ENV NODE_ENV=production

# 포트 노출
EXPOSE 3000

# 서버 실행
CMD ["node", "dist/index.js"]
