import { google, calendar_v3 } from 'googleapis';
import dayjs from 'dayjs';
import { config, getGoogleAuthMethod, bookingPolicy } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Room, CalendarEvent, FreeBusyTimeSlot, RoomAvailability } from '../types/index.js';

type Calendar = calendar_v3.Calendar;

let calendarClient: Calendar | null = null;

/**
 * Google Calendar API 클라이언트 초기화
 */
export async function initializeGoogleCalendar(): Promise<Calendar> {
  if (calendarClient) {
    return calendarClient;
  }

  const authMethod = getGoogleAuthMethod();
  logger.info(`Google Calendar API 인증 방식: ${authMethod}`);

  if (authMethod === 'service_account') {
    // 서비스 계정 인증
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.google.serviceAccountEmail,
        private_key: config.google.privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    calendarClient = google.calendar({ version: 'v3', auth });
  } else if (authMethod === 'oauth') {
    // OAuth 인증
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret
    );

    oauth2Client.setCredentials({
      refresh_token: config.google.refreshToken,
    });

    calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
  } else {
    throw new Error('Google Calendar API 인증 정보가 설정되지 않았습니다.');
  }

  logger.info('Google Calendar API 클라이언트 초기화 완료');
  return calendarClient;
}

/**
 * 여러 회의실의 가용성을 한 번에 확인 (FreeBusy API)
 */
export async function checkRoomsAvailability(
  rooms: Room[],
  startTime: string,
  endTime: string
): Promise<RoomAvailability[]> {
  const calendar = await initializeGoogleCalendar();

  const calendarIds = rooms.map((room) => ({ id: room.calendarId }));

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime,
        timeMax: endTime,
        timeZone: config.calendar.timezone,
        items: calendarIds,
      },
    });

    const calendars = response.data.calendars || {};

    return rooms.map((room) => {
      const calendarInfo = calendars[room.calendarId];
      const busy = (calendarInfo?.busy || []).map((slot) => ({
        start: slot.start || '',
        end: slot.end || '',
      }));

      return {
        room,
        busy,
        available: busy.length === 0,
      };
    });
  } catch (error) {
    logger.error('FreeBusy 조회 실패', { error });
    throw new Error('회의실 가용성 확인에 실패했습니다.');
  }
}

/**
 * 특정 회의실의 가용성 확인
 */
export async function checkRoomAvailability(
  room: Room,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const results = await checkRoomsAvailability([room], startTime, endTime);
  return results[0]?.available || false;
}

/**
 * 이벤트 생성 (회의실 예약)
 */
export async function createCalendarEvent(
  room: Room,
  event: CalendarEvent
): Promise<string> {
  const calendar = await initializeGoogleCalendar();

  // 회의실을 참석자로 추가
  const attendees: calendar_v3.Schema$EventAttendee[] = [
    {
      email: room.email,
      resource: true,
      displayName: room.displayName,
    },
  ];

  try {
    const response = await calendar.events.insert({
      calendarId: room.calendarId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: event.start.dateTime,
          timeZone: event.start.timeZone,
        },
        end: {
          dateTime: event.end.dateTime,
          timeZone: event.end.timeZone,
        },
        attendees,
        extendedProperties: event.extendedProperties,
      },
    });

    const eventId = response.data.id;
    if (!eventId) {
      throw new Error('이벤트 ID를 받지 못했습니다.');
    }

    logger.info(`이벤트 생성 완료: ${eventId}`, { roomName: room.name });
    return eventId;
  } catch (error: any) {
    logger.error('이벤트 생성 실패', { error: error.message, room: room.name });
    
    // Google API 에러 코드별 처리
    if (error.code === 409) {
      throw new Error('해당 시간에 이미 예약이 있습니다.');
    } else if (error.code === 403) {
      throw new Error('회의실 예약 권한이 없습니다.');
    } else if (error.code === 404) {
      throw new Error('회의실 캘린더를 찾을 수 없습니다.');
    }
    
    throw new Error(`이벤트 생성 실패: ${error.message}`);
  }
}

/**
 * 이벤트 삭제 (예약 취소)
 */
export async function deleteCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<boolean> {
  const calendar = await initializeGoogleCalendar();

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    });

    logger.info(`이벤트 삭제 완료: ${eventId}`);
    return true;
  } catch (error: any) {
    logger.error('이벤트 삭제 실패', { error: error.message, eventId });
    
    if (error.code === 404) {
      // 이미 삭제된 경우
      logger.warn(`이벤트가 이미 삭제됨: ${eventId}`);
      return true;
    }
    
    throw new Error(`이벤트 삭제 실패: ${error.message}`);
  }
}

/**
 * 이벤트 조회
 */
export async function getCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<calendar_v3.Schema$Event | null> {
  const calendar = await initializeGoogleCalendar();

  try {
    const response = await calendar.events.get({
      calendarId,
      eventId,
    });

    return response.data;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * 특정 날짜의 이벤트 목록 조회
 */
export async function getEventsForDate(
  calendarId: string,
  date: string
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = await initializeGoogleCalendar();

  const startOfDay = dayjs(date).startOf('day').toISOString();
  const endOfDay = dayjs(date).endOf('day').toISOString();

  try {
    const response = await calendar.events.list({
      calendarId,
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error: any) {
    logger.error('이벤트 목록 조회 실패', { error: error.message, calendarId, date });
    throw new Error(`이벤트 목록 조회 실패: ${error.message}`);
  }
}

/**
 * 이벤트 업데이트 (시간 변경 등)
 */
export async function updateCalendarEvent(
  calendarId: string,
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<calendar_v3.Schema$Event> {
  const calendar = await initializeGoogleCalendar();

  try {
    const response = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody: {
        summary: updates.summary,
        description: updates.description,
        start: updates.start ? {
          dateTime: updates.start.dateTime,
          timeZone: updates.start.timeZone,
        } : undefined,
        end: updates.end ? {
          dateTime: updates.end.dateTime,
          timeZone: updates.end.timeZone,
        } : undefined,
      },
    });

    logger.info(`이벤트 업데이트 완료: ${eventId}`);
    return response.data;
  } catch (error: any) {
    logger.error('이벤트 업데이트 실패', { error: error.message, eventId });
    throw new Error(`이벤트 업데이트 실패: ${error.message}`);
  }
}

/**
 * 회의실 캘린더의 하루 일정 타임라인 생성
 */
export async function getDayTimeline(
  room: Room,
  date: string
): Promise<{ time: string; status: 'free' | 'busy'; title?: string }[]> {
  const startOfDay = dayjs(date).hour(parseInt(bookingPolicy.bookingHoursStart.split(':')[0]));
  const endOfDay = dayjs(date).hour(parseInt(bookingPolicy.bookingHoursEnd.split(':')[0]));

  const [availability] = await checkRoomsAvailability(
    [room],
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );

  const timeline: { time: string; status: 'free' | 'busy'; title?: string }[] = [];
  const slots = 30; // 30분 단위

  let currentTime = startOfDay;
  while (currentTime.isBefore(endOfDay)) {
    const slotStart = currentTime.toISOString();
    const slotEnd = currentTime.add(slots, 'minute').toISOString();

    // 해당 슬롯이 바쁜지 확인
    const isBusy = availability.busy.some((busySlot) => {
      const busyStart = dayjs(busySlot.start);
      const busyEnd = dayjs(busySlot.end);
      return (
        (currentTime.isAfter(busyStart) || currentTime.isSame(busyStart)) &&
        currentTime.isBefore(busyEnd)
      );
    });

    timeline.push({
      time: currentTime.format('HH:mm'),
      status: isBusy ? 'busy' : 'free',
    });

    currentTime = currentTime.add(slots, 'minute');
  }

  return timeline;
}

export default {
  initializeGoogleCalendar,
  checkRoomsAvailability,
  checkRoomAvailability,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  getEventsForDate,
  updateCalendarEvent,
  getDayTimeline,
};

