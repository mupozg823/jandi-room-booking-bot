import express, { Request, Response, NextFunction } from 'express';
import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import webhookRoutes from './routes/webhook.js';
import adminRoutes from './routes/admin.js';

const app = express();

// JSON 파싱 미들웨어
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 요청 로깅 미들웨어
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });
  
  next();
});

// 헬스 체크 (루트)
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'JANDI Room Booking Bot',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// 라우트 등록
app.use('/jandi', webhookRoutes);
app.use('/admin', adminRoutes);

// 404 핸들러
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// 에러 핸들러
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

// 서버 시작
async function startServer(): Promise<void> {
  // 설정 유효성 검사
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    logger.warn('설정 경고:', { errors: configValidation.errors });
  }

  // 서버 시작
  app.listen(config.port, () => {
    logger.info(`🚀 JANDI Room Booking Bot 서버 시작`, {
      port: config.port,
      env: config.nodeEnv,
    });
    
    logger.info('📋 엔드포인트:', {
      webhook: `POST http://localhost:${config.port}/jandi/command`,
      health: `GET http://localhost:${config.port}/jandi/health`,
      admin: `http://localhost:${config.port}/admin/*`,
    });
  });
}

// 프로세스 시그널 핸들링
process.on('SIGTERM', () => {
  logger.info('SIGTERM 수신, 서버 종료 중...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT 수신, 서버 종료 중...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason });
});

// 서버 시작
startServer().catch((error) => {
  logger.error('서버 시작 실패', { error: error.message });
  process.exit(1);
});

export { app };

