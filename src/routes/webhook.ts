import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { handleCommand } from '../services/commandHandler.js';
import type { JandiOutgoingWebhookPayload, JandiWebhookResponse } from '../types/index.js';

const router = Router();

/**
 * 잔디 토큰 검증 미들웨어
 */
function validateToken(req: Request, res: Response, next: NextFunction): void {
  const payload = req.body as JandiOutgoingWebhookPayload;
  
  if (!payload.token) {
    logger.warn('토큰이 없는 요청', { ip: req.ip });
    res.status(401).json({ 
      body: '❌ 인증되지 않은 요청입니다.',
      connectColor: '#E74C3C'
    });
    return;
  }

  if (payload.token !== config.jandi.outgoingToken) {
    logger.warn('잘못된 토큰', { ip: req.ip, token: payload.token.substring(0, 8) + '...' });
    res.status(403).json({ 
      body: '❌ 토큰이 유효하지 않습니다.',
      connectColor: '#E74C3C'
    });
    return;
  }

  next();
}

/**
 * 요청 로깅 미들웨어
 */
function logRequest(req: Request, res: Response, next: NextFunction): void {
  const payload = req.body as JandiOutgoingWebhookPayload;
  logger.debug('웹훅 요청 수신', {
    method: req.method,
    path: req.path,
    user: payload.writerEmail,
    text: payload.text,
    ip: payload.ip || req.ip,
  });
  next();
}

/**
 * POST /jandi/command
 * 잔디 Outgoing Webhook 수신 엔드포인트
 */
router.post(
  '/command',
  logRequest,
  validateToken,
  async (req: Request, res: Response): Promise<void> => {
    const payload = req.body as JandiOutgoingWebhookPayload;

    try {
      // 실제 클라이언트 IP 추출 (프록시 환경 대응)
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
                       || req.ip 
                       || payload.ip;
      
      // IP 정보 업데이트
      const enrichedPayload: JandiOutgoingWebhookPayload = {
        ...payload,
        ip: clientIp,
      };

      // 명령어 처리
      const response = await handleCommand(enrichedPayload);

      // 잔디 응답 형식으로 반환
      res.json(response);
    } catch (error: any) {
      logger.error('웹훅 처리 오류', { error: error.message, stack: error.stack });
      
      res.status(500).json({
        body: `❌ 서버 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.`,
        connectColor: '#E74C3C',
      } as JandiWebhookResponse);
    }
  }
);

/**
 * GET /jandi/health
 * 헬스 체크 엔드포인트
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'jandi-room-booking-bot',
  });
});

/**
 * POST /jandi/test
 * 테스트 엔드포인트 (개발 환경 전용)
 */
router.post('/test', (req: Request, res: Response) => {
  if (config.nodeEnv !== 'development') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  const testPayload: JandiOutgoingWebhookPayload = {
    token: config.jandi.outgoingToken,
    teamName: 'TestTeam',
    roomName: 'TestRoom',
    writerName: 'Test User',
    writerEmail: 'test@example.com',
    text: req.body.text || 'room help',
    data: req.body.data || 'help',
    keyword: 'room',
    ip: req.ip || '127.0.0.1',
    createdAt: new Date().toISOString(),
  };

  // 동일한 핸들러로 처리
  handleCommand(testPayload)
    .then((response) => res.json(response))
    .catch((error) => {
      res.status(500).json({
        body: `❌ 테스트 오류: ${error.message}`,
        connectColor: '#E74C3C',
      });
    });
});

export default router;

