/**
 * 잔디(JANDI) 웹훅 관련 타입 정의
 */

// 잔디 Outgoing Webhook 요청 페이로드
export interface JandiOutgoingWebhookPayload {
  token: string;              // 웹훅 토큰 (검증용)
  teamName: string;           // 팀 이름
  roomName: string;           // 토픽/채널 이름
  writerName: string;         // 작성자 이름
  writerEmail: string;        // 작성자 이메일
  text: string;               // 전체 메시지 (트리거 워드 포함)
  data: string;               // 트리거 워드 제외 본문
  keyword: string;            // 트리거 워드
  ip: string;                 // 요청 IP
  createdAt: string;          // 메시지 작성 시간
}

// 잔디 Outgoing Webhook 응답 형식
export interface JandiWebhookResponse {
  body: string;
  connectColor?: string;      // 사이드바 색상 (헥스코드)
  connectInfo?: JandiConnectInfo[];
}

// 잔디 카드형 메시지 정보
export interface JandiConnectInfo {
  title?: string;
  description?: string;
  imageUrl?: string;
}

// 잔디 Incoming Webhook 메시지 형식
export interface JandiIncomingMessage {
  body: string;               // 메시지 본문 (필수)
  connectColor?: string;      // 사이드바 색상
  connectInfo?: JandiConnectInfo[];
}

/**
 * 명령어 관련 타입 정의
 */

export type CommandType = 'status' | 'book' | 'cancel' | 'move' | 'extend' | 'my' | 'help' | 'list';

export interface ParsedCommand {
  type: CommandType;
  args: Record<string, string | number | undefined>;
  raw: string;
}

// 예약 생성 명령 인자
export interface BookCommandArgs {
  roomName: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:mm
  duration: number;       // 분 단위
  title: string;
}

// 예약 취소 명령 인자
export interface CancelCommandArgs {
  bookingId: string;
}

// 현황 조회 명령 인자
export interface StatusCommandArgs {
  date?: string;          // YYYY-MM-DD 또는 'today'
  timeRange?: string;     // HH:mm-HH:mm
}

// 내 예약 조회 명령 인자
export interface MyCommandArgs {
  filter?: 'today' | 'week' | 'all';
}

/**
 * 데이터베이스 모델 타입
 */

export interface Room {
  id: number;
  name: string;
  displayName: string;
  email: string;          // Google Calendar 리소스 이메일
  calendarId: string;     // Google Calendar ID
  capacity: number;
  location: string;
  autoAccept: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: number;
  bookingId: string;      // 사용자 친화적 ID (예: R-12345)
  roomId: number;
  calendarId: string;
  eventId: string;        // Google Calendar 이벤트 ID
  title: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  durationMinutes: number;
  requestedBy: string;    // 예약자 이메일
  requestedByName: string;
  status: 'active' | 'cancelled' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: number;
  userEmail: string;
  userName: string;
  command: string;
  commandType: CommandType;
  parameters: string;     // JSON 문자열
  status: 'success' | 'failure';
  response: string;
  errorMessage?: string;
  ipAddress: string;
  roomName: string;
  timestamp: string;
}

/**
 * Google Calendar API 관련 타입
 */

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: CalendarAttendee[];
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  resource?: boolean;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
}

export interface FreeBusyTimeSlot {
  start: string;
  end: string;
}

export interface RoomAvailability {
  room: Room;
  busy: FreeBusyTimeSlot[];
  available: boolean;
}

/**
 * 응답 결과 타입
 */

export interface CommandResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    details?: string;
  };
}

/**
 * 정책/설정 타입
 */

export interface BookingPolicy {
  maxDurationMinutes: number;
  minDurationMinutes: number;
  bufferMinutes: number;
  bookingHoursStart: string;  // HH:mm
  bookingHoursEnd: string;    // HH:mm
  allowedDaysAhead: number;
  timezone: string;
}

