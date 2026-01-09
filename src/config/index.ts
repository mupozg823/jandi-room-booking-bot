import dotenv from 'dotenv';
import path from 'path';
import type { BookingPolicy } from '../types/index.js';

// 환경 변수 로드
dotenv.config();

export const config = {
  // 서버 설정
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // 잔디 웹훅 설정
  jandi: {
    outgoingToken: process.env.JANDI_OUTGOING_TOKEN || '',
    incomingWebhookUrl: process.env.JANDI_INCOMING_WEBHOOK_URL || '',
  },
  
  // Google Calendar API 설정
  google: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },
  
  // 캘린더 설정
  calendar: {
    timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Seoul',
  },
  
  // 데이터베이스 설정
  database: {
    path: process.env.DATABASE_PATH || './data/bookings.db',
  },
  
  // 로깅 설정
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// 예약 정책
export const bookingPolicy: BookingPolicy = {
  maxDurationMinutes: parseInt(process.env.MAX_BOOKING_DURATION_MINUTES || '240', 10),
  minDurationMinutes: parseInt(process.env.MIN_BOOKING_DURATION_MINUTES || '15', 10),
  bufferMinutes: parseInt(process.env.BUFFER_MINUTES_BETWEEN_MEETINGS || '10', 10),
  bookingHoursStart: process.env.BOOKING_HOURS_START || '08:00',
  bookingHoursEnd: process.env.BOOKING_HOURS_END || '22:00',
  allowedDaysAhead: parseInt(process.env.ALLOWED_DAYS_AHEAD || '30', 10),
  timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Seoul',
};

// Google API 인증 방식 확인
export function getGoogleAuthMethod(): 'service_account' | 'oauth' | 'none' {
  if (config.google.serviceAccountEmail && config.google.privateKey) {
    return 'service_account';
  }
  if (config.google.clientId && config.google.clientSecret && config.google.refreshToken) {
    return 'oauth';
  }
  return 'none';
}

// 설정 유효성 검사
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 잔디 토큰 확인
  if (!config.jandi.outgoingToken) {
    errors.push('JANDI_OUTGOING_TOKEN이 설정되지 않았습니다.');
  }

  // Google 인증 확인 (선택적 - DB 전용 모드에서는 필요 없음)
  const authMethod = getGoogleAuthMethod();
  if (authMethod === 'none') {
    // Google Calendar 없이 DB 전용 모드로 동작
    console.log('ℹ️  Google Calendar API 미설정 - DB 전용 모드로 동작합니다.');
  }

  // 예약 정책 유효성
  if (bookingPolicy.minDurationMinutes < 5) {
    errors.push('최소 예약 시간은 5분 이상이어야 합니다.');
  }
  if (bookingPolicy.maxDurationMinutes < bookingPolicy.minDurationMinutes) {
    errors.push('최대 예약 시간은 최소 예약 시간보다 커야 합니다.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default config;

