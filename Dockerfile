# Node.js 기반 Docker 이미지
FROM node:20-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 복사 및 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY dist/ ./dist/
COPY data/ ./data/ 2>/dev/null || mkdir -p ./data

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080

# 포트 노출
EXPOSE 8080

# 서버 실행
CMD ["node", "dist/index.js"]

