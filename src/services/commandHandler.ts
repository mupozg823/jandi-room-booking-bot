import dayjs from 'dayjs';
import { config, bookingPolicy } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { parseCommand, getHelpMessage } from './commandParser.js';
import * as db from './database.js';
import type {
  JandiOutgoingWebhookPayload,
  JandiWebhookResponse,
  CommandResult,
  BookCommandArgs,
  CancelCommandArgs,
  StatusCommandArgs,
  MyCommandArgs,
} from '../types/index.js';

/**
 * 예약 ID 생성 (R-XXXXX 형식)
 */
function generateBookingId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `R-${timestamp}${random}`.substring(0, 10);
}

/**
 * 잔디 응답 메시지 포맷팅
 */
function formatResponse(result: CommandResult): JandiWebhookResponse {
  const color = result.success ? '#2ECC71' : '#E74C3C';
  
  return {
    body: result.message,
    connectColor: color,
  };
}

/**
 * 메인 명령어 핸들러
 */
export async function handleCommand(
  payload: JandiOutgoingWebhookPayload
): Promise<JandiWebhookResponse> {
  const startTime = Date.now();
  
  logger.info('명령어 수신', {
    user: payload.writerEmail,
    data: payload.data,
    room: payload.roomName,
  });

  // 명령어 파싱
  const parseResult = parseCommand(payload.data);
  
  if (!parseResult.success) {
    const result: CommandResult = {
      success: false,
      message: `❌ ${parseResult.error}`,
      error: { code: 'PARSE_ERROR' },
    };
    
    logCommand(payload, 'help', result, startTime);
    return formatResponse(result);
  }

  const command = parseResult.command!;
  let result: CommandResult;

  try {
    switch (command.type) {
      case 'help':
        result = { success: true, message: getHelpMessage() };
        break;
      case 'status':
        result = await handleStatusCommand(command.args as unknown as StatusCommandArgs);
        break;
      case 'book':
        result = await handleBookCommand(command.args as unknown as BookCommandArgs, payload);
        break;
      case 'cancel':
        result = await handleCancelCommand(command.args as unknown as CancelCommandArgs, payload);
        break;
      case 'my':
        result = await handleMyCommand(command.args as unknown as MyCommandArgs, payload);
        break;
      case 'list':
        result = await handleListCommand(command.args);
        break;
      case 'move':
        result = await handleMoveCommand(command.args, payload);
        break;
      case 'extend':
        result = await handleExtendCommand(command.args, payload);
        break;
      default:
        result = {
          success: false,
          message: `❌ 지원하지 않는 명령어입니다: ${command.type}`,
          error: { code: 'UNKNOWN_COMMAND' },
        };
    }
  } catch (error: any) {
    logger.error('명령어 처리 실패', { error: error.message, command: command.type });
    result = {
      success: false,
      message: `❌ 오류가 발생했습니다: ${error.message}`,
      error: { code: 'INTERNAL_ERROR', details: error.message },
    };
  }

  logCommand(payload, command.type, result, startTime);
  return formatResponse(result);
}

/**
 * 시간을 분 단위로 변환
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 시간표 TUI 생성 함수 (30분 단위)
 */
function generateTimeTableTUI(
  rooms: ReturnType<typeof db.getAllRooms>,
  date: string,
  startHour: number,
  endHour: number
): string {
  // 30분 단위 슬롯 생성
  const slots: { hour: number; half: boolean }[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push({ hour: h, half: false }); // 정시
    slots.push({ hour: h, half: true });  // 30분
  }

  // 각 회의실별 예약 정보 가져오기
  const roomBookings = rooms.map(room => ({
    room,
    bookings: db.getBookingsByDate(date, room.id),
  }));

  // 슬롯이 예약되어 있는지 확인하는 함수
  function isSlotBooked(bookings: any[], slotHour: number, isHalf: boolean): boolean {
    const slotMinutes = slotHour * 60 + (isHalf ? 30 : 0);
    const slotEndMinutes = slotMinutes + 30;
    
    return bookings.some(booking => {
      const bookingStart = timeToMinutes(booking.startTime);
      const bookingEnd = timeToMinutes(booking.endTime);
      // 슬롯이 예약 시간과 겹치는지 확인
      return slotMinutes < bookingEnd && slotEndMinutes > bookingStart;
    });
  }

  let tui = '';
  
  // 시간 헤더 (정시만 표시)
  const hourHeaders = [];
  for (let h = startHour; h < endHour; h++) {
    hourHeaders.push(h.toString().padStart(2, '0'));
  }
  
  // 컴팩트한 디자인
  const headerLine = hourHeaders.join('  ');
  const totalWidth = headerLine.length;
  
  tui += `     ${headerLine}\n`;
  tui += `    ┌${'─'.repeat(totalWidth)}┐\n`;

  // 각 회의실 행
  for (let i = 0; i < roomBookings.length; i++) {
    const { room, bookings } = roomBookings[i];
    
    // 회의실 이름 (짧은 버전 사용)
    const roomLabel = room.name.padEnd(2);
    
    // 슬롯 상태 생성 (30분 단위)
    let slotLine = '';
    for (let h = startHour; h < endHour; h++) {
      const firstHalf = isSlotBooked(bookings, h, false) ? '█' : '·';
      const secondHalf = isSlotBooked(bookings, h, true) ? '█' : '·';
      slotLine += `${firstHalf}${secondHalf} `;
    }
    slotLine = slotLine.trimEnd();
    
    tui += ` ${roomLabel} │${slotLine}│\n`;
    
    // 회의실 간 구분선 (마지막 제외)
    if (i < roomBookings.length - 1) {
      tui += `    ├${'─'.repeat(totalWidth)}┤\n`;
    }
  }
  
  tui += `    └${'─'.repeat(totalWidth)}┘`;

  return tui;
}

/**
 * status 명령어 처리 (DB 기반, TUI 스타일)
 */
async function handleStatusCommand(args: StatusCommandArgs): Promise<CommandResult> {
  const date = args.date || dayjs().format('YYYY-MM-DD');
  const rooms = db.getAllRooms();

  if (rooms.length === 0) {
    return {
      success: true,
      message: '📋 등록된 회의실이 없습니다.\n관리자에게 회의실 등록을 요청하세요.',
    };
  }

  // 시간 범위 설정
  let startHour = parseInt(bookingPolicy.bookingHoursStart.split(':')[0], 10);
  let endHour = parseInt(bookingPolicy.bookingHoursEnd.split(':')[0], 10);

  if (args.timeRange) {
    const [start, end] = args.timeRange.split('-');
    if (start && end) {
      startHour = parseInt(start.split(':')[0], 10);
      endHour = parseInt(end.split(':')[0], 10);
    }
  }

  try {
    const dateDisplay = dayjs(date).format('YYYY년 MM월 DD일');

    // TUI 시간표 생성
    const timeTable = generateTimeTableTUI(rooms, date, startHour, endHour);

    // 예약 상세 정보
    let details = '';
    for (const room of rooms) {
      const bookings = db.getBookingsByDate(date, room.id);
      if (bookings.length > 0) {
        details += `\n📍 ${room.displayName}:\n`;
        for (const booking of bookings) {
          details += `   • ${booking.startTime}-${booking.endTime} ${booking.title} (${booking.requestedByName})\n`;
        }
      }
    }

    let message = `📅 **${dateDisplay} 회의실 현황**\n`;
    message += `⏰ ${startHour.toString().padStart(2, '0')}:00 ~ ${endHour.toString().padStart(2, '0')}:00 (30분 단위)\n\n`;
    message += '```\n';
    message += timeTable;
    message += '\n```\n';
    // 범례와 회의실 정보
    message += '\n**범례**: █ 예약됨 · 가용\n';
    message += '**회의실**: ';
    message += rooms.map(r => `${r.name}(${r.displayName}, ${r.capacity}명)`).join(' | ');
    message += '\n';

    if (details) {
      message += `\n📋 **예약 상세**${details}`;
    }

    return { success: true, message };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ 현황 조회 실패: ${error.message}`,
      error: { code: 'STATUS_ERROR' },
    };
  }
}

/**
 * book 명령어 처리 (DB 기반)
 */
async function handleBookCommand(
  args: BookCommandArgs,
  payload: JandiOutgoingWebhookPayload
): Promise<CommandResult> {
  // 회의실 확인
  const room = db.getRoomByName(args.roomName);
  if (!room) {
    const rooms = db.getAllRooms();
    const roomList = rooms.map(r => r.name).join(', ');
    return {
      success: false,
      message: `❌ 회의실 '${args.roomName}'을(를) 찾을 수 없습니다.\n사용 가능한 회의실: ${roomList || '없음'}`,
      error: { code: 'ROOM_NOT_FOUND' },
    };
  }

  // 시간 계산
  const startDateTime = dayjs(`${args.date} ${args.startTime}`, 'YYYY-MM-DD HH:mm');
  const endDateTime = startDateTime.add(args.duration, 'minute');
  const endTime = endDateTime.format('HH:mm');

  // 과거 시간 체크
  if (startDateTime.isBefore(dayjs())) {
    return {
      success: false,
      message: '❌ 과거 시간에는 예약할 수 없습니다.',
      error: { code: 'PAST_TIME' },
    };
  }

  // 영업 시간 체크
  const startHour = startDateTime.hour();
  const endHour = endDateTime.hour();
  const policyStartHour = parseInt(bookingPolicy.bookingHoursStart.split(':')[0], 10);
  const policyEndHour = parseInt(bookingPolicy.bookingHoursEnd.split(':')[0], 10);

  if (startHour < policyStartHour || endHour > policyEndHour) {
    return {
      success: false,
      message: `❌ 예약 가능 시간은 ${bookingPolicy.bookingHoursStart}~${bookingPolicy.bookingHoursEnd}입니다.`,
      error: { code: 'OUTSIDE_HOURS' },
    };
  }

  try {
    // DB 기반 가용성 확인
    const isAvailable = db.checkRoomAvailability(room.id, args.date, args.startTime, endTime);

    if (!isAvailable) {
      return {
        success: false,
        message: `❌ 회의실 '${room.displayName}'은(는) 해당 시간에 이미 예약되어 있습니다.\n시간: ${args.date} ${args.startTime}-${endTime}`,
        error: { code: 'CONFLICT' },
      };
    }

    // 예약 ID 생성
    const bookingId = generateBookingId();

    // DB에 예약 정보 저장
    db.createBooking({
      bookingId,
      roomId: room.id,
      calendarId: room.calendarId || '',
      eventId: bookingId, // Google Calendar 없이 bookingId를 eventId로 사용
      title: args.title,
      date: args.date,
      startTime: args.startTime,
      endTime: endTime,
      durationMinutes: args.duration,
      requestedBy: payload.writerEmail,
      requestedByName: payload.writerName,
      status: 'active',
    });

    const message = `✅ **예약 완료**

📌 **예약 ID**: \`${bookingId}\`
🏢 **회의실**: ${room.displayName}
📅 **일시**: ${args.date} ${args.startTime}-${endTime} (${args.duration}분)
📝 **제목**: ${args.title}
👤 **예약자**: ${payload.writerName}

❌ 취소하려면: \`취소 ${bookingId}\``;

    return { success: true, message, data: { bookingId } };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ 예약 실패: ${error.message}`,
      error: { code: 'BOOKING_ERROR' },
    };
  }
}

/**
 * cancel 명령어 처리 (DB 기반)
 */
async function handleCancelCommand(
  args: CancelCommandArgs,
  payload: JandiOutgoingWebhookPayload
): Promise<CommandResult> {
  const booking = db.getBookingById(args.bookingId);

  if (!booking) {
    return {
      success: false,
      message: `❌ 예약 ID '${args.bookingId}'을(를) 찾을 수 없습니다.`,
      error: { code: 'BOOKING_NOT_FOUND' },
    };
  }

  if (booking.status !== 'active') {
    return {
      success: false,
      message: `❌ 이 예약은 이미 ${booking.status === 'cancelled' ? '취소' : '완료'}되었습니다.`,
      error: { code: 'INVALID_STATUS' },
    };
  }

  // 본인 예약인지 확인 (관리자는 추후 별도 처리)
  if (booking.requestedBy !== payload.writerEmail) {
    return {
      success: false,
      message: `❌ 본인이 예약한 건만 취소할 수 있습니다.`,
      error: { code: 'UNAUTHORIZED' },
    };
  }

  try {
    // DB 상태 업데이트
    db.updateBookingStatus(args.bookingId, 'cancelled');

    const room = db.getRoomById(booking.roomId);

    const message = `✅ **예약 취소 완료**

📌 **예약 ID**: \`${args.bookingId}\`
🏢 **회의실**: ${room?.displayName || '알 수 없음'}
📅 **일시**: ${booking.date} ${booking.startTime}-${booking.endTime}
📝 **제목**: ${booking.title}`;

    return { success: true, message };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ 예약 취소 실패: ${error.message}`,
      error: { code: 'CANCEL_ERROR' },
    };
  }
}

/**
 * my 명령어 처리
 */
async function handleMyCommand(
  args: MyCommandArgs,
  payload: JandiOutgoingWebhookPayload
): Promise<CommandResult> {
  const filter = args.filter || 'all';
  const bookings = db.getBookingsByUser(payload.writerEmail, filter);

  if (bookings.length === 0) {
    const filterText = filter === 'today' ? '오늘' : filter === 'week' ? '이번 주' : '';
    return {
      success: true,
      message: `📋 ${filterText} 예약 내역이 없습니다.`,
    };
  }

  let message = `📋 **${payload.writerName}님의 예약 목록** (${filter === 'today' ? '오늘' : filter === 'week' ? '이번 주' : '전체'})\n\n`;

  for (const booking of bookings) {
    const room = db.getRoomById(booking.roomId);
    message += `• \`${booking.bookingId}\` ${booking.date} ${booking.startTime}-${booking.endTime}\n`;
    message += `  📍 ${room?.displayName || '알 수 없음'} | ${booking.title}\n\n`;
  }

  message += `\n총 ${bookings.length}건`;

  return { success: true, message };
}

/**
 * list 명령어 처리
 */
async function handleListCommand(args: Record<string, string | number | undefined>): Promise<CommandResult> {
  if (args.target === 'rooms') {
    const rooms = db.getAllRooms();

    if (rooms.length === 0) {
      return {
        success: true,
        message: '📋 등록된 회의실이 없습니다.',
      };
    }

    let message = '🏢 **회의실 목록**\n\n';
    for (const room of rooms) {
      message += `• **${room.name}** - ${room.displayName}\n`;
      message += `  📍 ${room.location} | 👥 ${room.capacity}명\n\n`;
    }

    return { success: true, message };
  }

  // 특정 날짜 예약 목록
  if (args.target === 'bookings' && args.date) {
    const date = args.date as string;
    const bookings = db.getBookingsByDate(date);

    if (bookings.length === 0) {
      return {
        success: true,
        message: `📋 ${date} 예약 내역이 없습니다.`,
      };
    }

    let message = `📋 **${date} 전체 예약**\n\n`;

    for (const booking of bookings) {
      const room = db.getRoomById(booking.roomId);
      message += `• \`${booking.bookingId}\` ${booking.startTime}-${booking.endTime}\n`;
      message += `  📍 ${room?.displayName || '알 수 없음'} | ${booking.title} | ${booking.requestedByName}\n\n`;
    }

    message += `\n총 ${bookings.length}건`;

    return { success: true, message };
  }

  return {
    success: false,
    message: '❌ 잘못된 list 명령어입니다.',
    error: { code: 'INVALID_LIST' },
  };
}

/**
 * move 명령어 처리 (예약 시간 변경, DB 기반)
 */
async function handleMoveCommand(
  args: Record<string, string | number | undefined>,
  payload: JandiOutgoingWebhookPayload
): Promise<CommandResult> {
  const bookingId = args.bookingId as string;
  const newDate = args.date as string;
  const newStartTime = args.startTime as string;

  const booking = db.getBookingById(bookingId);

  if (!booking) {
    return {
      success: false,
      message: `❌ 예약 ID '${bookingId}'을(를) 찾을 수 없습니다.`,
      error: { code: 'BOOKING_NOT_FOUND' },
    };
  }

  if (booking.requestedBy !== payload.writerEmail) {
    return {
      success: false,
      message: `❌ 본인이 예약한 건만 변경할 수 있습니다.`,
      error: { code: 'UNAUTHORIZED' },
    };
  }

  const room = db.getRoomById(booking.roomId);
  if (!room) {
    return {
      success: false,
      message: `❌ 회의실 정보를 찾을 수 없습니다.`,
      error: { code: 'ROOM_NOT_FOUND' },
    };
  }

  const startDateTime = dayjs(`${newDate} ${newStartTime}`, 'YYYY-MM-DD HH:mm');
  const endDateTime = startDateTime.add(booking.durationMinutes, 'minute');
  const newEndTime = endDateTime.format('HH:mm');

  try {
    // DB 기반 가용성 확인 (자기 자신 제외)
    const isAvailable = db.checkRoomAvailability(
      room.id,
      newDate,
      newStartTime,
      newEndTime,
      bookingId
    );

    if (!isAvailable) {
      return {
        success: false,
        message: `❌ 새로운 시간에 회의실이 이미 예약되어 있습니다.`,
        error: { code: 'CONFLICT' },
      };
    }

    // DB 업데이트
    db.updateBookingTime(bookingId, newDate, newStartTime, newEndTime);

    const message = `✅ **예약 변경 완료**

📌 **예약 ID**: \`${bookingId}\`
🏢 **회의실**: ${room.displayName}
📅 **기존**: ${booking.date} ${booking.startTime}-${booking.endTime}
📅 **변경**: ${newDate} ${newStartTime}-${newEndTime}`;

    return { success: true, message };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ 예약 변경 실패: ${error.message}`,
      error: { code: 'MOVE_ERROR' },
    };
  }
}

/**
 * extend 명령어 처리 (예약 시간 연장, DB 기반)
 */
async function handleExtendCommand(
  args: Record<string, string | number | undefined>,
  payload: JandiOutgoingWebhookPayload
): Promise<CommandResult> {
  const bookingId = args.bookingId as string;
  const additionalMinutes = args.additionalMinutes as number;

  const booking = db.getBookingById(bookingId);

  if (!booking) {
    return {
      success: false,
      message: `❌ 예약 ID '${bookingId}'을(를) 찾을 수 없습니다.`,
      error: { code: 'BOOKING_NOT_FOUND' },
    };
  }

  if (booking.requestedBy !== payload.writerEmail) {
    return {
      success: false,
      message: `❌ 본인이 예약한 건만 연장할 수 있습니다.`,
      error: { code: 'UNAUTHORIZED' },
    };
  }

  const room = db.getRoomById(booking.roomId);
  if (!room) {
    return {
      success: false,
      message: `❌ 회의실 정보를 찾을 수 없습니다.`,
      error: { code: 'ROOM_NOT_FOUND' },
    };
  }

  const currentEndDateTime = dayjs(`${booking.date} ${booking.endTime}`, 'YYYY-MM-DD HH:mm');
  const newEndDateTime = currentEndDateTime.add(additionalMinutes, 'minute');
  const newEndTime = newEndDateTime.format('HH:mm');

  // 새로운 총 시간 체크
  const newTotalMinutes = booking.durationMinutes + additionalMinutes;
  if (newTotalMinutes > bookingPolicy.maxDurationMinutes) {
    return {
      success: false,
      message: `❌ 최대 예약 시간(${bookingPolicy.maxDurationMinutes}분)을 초과합니다.`,
      error: { code: 'MAX_DURATION' },
    };
  }

  try {
    // DB 기반 연장 구간 가용성 확인 (자기 자신 제외)
    const isAvailable = db.checkRoomAvailability(
      room.id,
      booking.date,
      booking.endTime,
      newEndTime,
      bookingId
    );

    if (!isAvailable) {
      return {
        success: false,
        message: `❌ 연장하려는 시간에 다른 예약이 있습니다.`,
        error: { code: 'CONFLICT' },
      };
    }

    // DB 업데이트
    db.updateBookingEndTime(bookingId, newEndTime, newTotalMinutes);

    const message = `✅ **예약 연장 완료**

📌 **예약 ID**: \`${bookingId}\`
🏢 **회의실**: ${room.displayName}
📅 **일시**: ${booking.date} ${booking.startTime}-${newEndTime}
⏱️ **연장**: +${additionalMinutes}분 (총 ${newTotalMinutes}분)`;

    return { success: true, message };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ 예약 연장 실패: ${error.message}`,
      error: { code: 'EXTEND_ERROR' },
    };
  }
}

/**
 * 명령어 실행 로그 기록
 */
function logCommand(
  payload: JandiOutgoingWebhookPayload,
  commandType: string,
  result: CommandResult,
  startTime: number
): void {
  const duration = Date.now() - startTime;
  
  db.createAuditLog({
    userEmail: payload.writerEmail,
    userName: payload.writerName,
    command: payload.text,
    commandType: commandType as any,
    parameters: JSON.stringify(payload),
    status: result.success ? 'success' : 'failure',
    response: result.message,
    errorMessage: result.error?.details,
    ipAddress: payload.ip,
    roomName: payload.roomName,
  });

  logger.info('명령어 처리 완료', {
    user: payload.writerEmail,
    command: commandType,
    success: result.success,
    duration: `${duration}ms`,
  });
}

export default {
  handleCommand,
};

