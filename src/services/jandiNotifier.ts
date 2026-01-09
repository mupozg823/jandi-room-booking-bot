import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { JandiIncomingMessage, JandiConnectInfo } from '../types/index.js';

/**
 * 잔디 Incoming Webhook으로 메시지 전송
 */
export async function sendNotification(message: JandiIncomingMessage): Promise<boolean> {
  if (!config.jandi.incomingWebhookUrl) {
    logger.warn('잔디 Incoming Webhook URL이 설정되지 않았습니다.');
    return false;
  }

  try {
    const response = await fetch(config.jandi.incomingWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.tosslab.jandi-v2+json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('잔디 알림 전송 실패', { 
        status: response.status, 
        error: errorText 
      });
      return false;
    }

    logger.info('잔디 알림 전송 성공');
    return true;
  } catch (error: any) {
    logger.error('잔디 알림 전송 오류', { error: error.message });
    return false;
  }
}

/**
 * 간단한 텍스트 알림 전송
 */
export async function sendTextNotification(
  text: string, 
  color: string = '#4A90E2'
): Promise<boolean> {
  return sendNotification({
    body: text,
    connectColor: color,
  });
}

/**
 * 카드형 알림 전송
 */
export async function sendCardNotification(
  body: string,
  cards: JandiConnectInfo[],
  color: string = '#4A90E2'
): Promise<boolean> {
  return sendNotification({
    body,
    connectColor: color,
    connectInfo: cards,
  });
}

/**
 * 예약 생성 알림
 */
export async function notifyBookingCreated(
  roomName: string,
  title: string,
  date: string,
  time: string,
  bookedBy: string,
  bookingId: string
): Promise<boolean> {
  const message: JandiIncomingMessage = {
    body: `📅 새로운 회의실 예약`,
    connectColor: '#2ECC71',
    connectInfo: [
      {
        title: `${roomName} 예약됨`,
        description: `📝 ${title}\n📅 ${date} ${time}\n👤 ${bookedBy}\n🔖 ${bookingId}`,
      },
    ],
  };

  return sendNotification(message);
}

/**
 * 예약 취소 알림
 */
export async function notifyBookingCancelled(
  roomName: string,
  title: string,
  date: string,
  time: string,
  cancelledBy: string,
  bookingId: string
): Promise<boolean> {
  const message: JandiIncomingMessage = {
    body: `❌ 회의실 예약 취소`,
    connectColor: '#E74C3C',
    connectInfo: [
      {
        title: `${roomName} 예약 취소됨`,
        description: `📝 ${title}\n📅 ${date} ${time}\n👤 ${cancelledBy}\n🔖 ${bookingId}`,
      },
    ],
  };

  return sendNotification(message);
}

/**
 * 회의 시작 임박 알림
 */
export async function notifyMeetingSoon(
  roomName: string,
  title: string,
  startTime: string,
  attendee: string,
  minutesBefore: number = 10
): Promise<boolean> {
  const message: JandiIncomingMessage = {
    body: `⏰ 회의 시작 ${minutesBefore}분 전`,
    connectColor: '#F1C40F',
    connectInfo: [
      {
        title: roomName,
        description: `📝 ${title}\n🕐 ${startTime} 시작\n👤 ${attendee}`,
      },
    ],
  };

  return sendNotification(message);
}

/**
 * 노쇼 경고 알림
 */
export async function notifyNoShow(
  roomName: string,
  title: string,
  startTime: string,
  bookedBy: string,
  bookingId: string
): Promise<boolean> {
  const message: JandiIncomingMessage = {
    body: `⚠️ 노쇼 감지`,
    connectColor: '#E67E22',
    connectInfo: [
      {
        title: `${roomName} - 체크인 미확인`,
        description: `📝 ${title}\n🕐 ${startTime} 시작 예정\n👤 ${bookedBy}\n🔖 ${bookingId}\n\n회의 시작 10분이 지났으나 체크인이 확인되지 않았습니다.`,
      },
    ],
  };

  return sendNotification(message);
}

/**
 * 회의 종료 시간 초과 경고
 */
export async function notifyOvertime(
  roomName: string,
  title: string,
  scheduledEndTime: string,
  bookedBy: string,
  bookingId: string
): Promise<boolean> {
  const message: JandiIncomingMessage = {
    body: `⚠️ 회의 종료 시간 초과`,
    connectColor: '#E74C3C',
    connectInfo: [
      {
        title: `${roomName} - 종료 시간 경과`,
        description: `📝 ${title}\n🕐 ${scheduledEndTime} 종료 예정\n👤 ${bookedBy}\n🔖 ${bookingId}\n\n예정된 종료 시간이 지났습니다. 다음 예약이 있을 수 있으니 확인해 주세요.`,
      },
    ],
  };

  return sendNotification(message);
}

/**
 * 일일 회의실 현황 브리핑
 */
export async function sendDailyBriefing(
  date: string,
  totalBookings: number,
  roomSummaries: { room: string; bookings: number }[]
): Promise<boolean> {
  let description = `📊 총 ${totalBookings}건의 예약\n\n`;
  
  for (const summary of roomSummaries) {
    description += `• ${summary.room}: ${summary.bookings}건\n`;
  }

  const message: JandiIncomingMessage = {
    body: `📅 ${date} 회의실 현황`,
    connectColor: '#3498DB',
    connectInfo: [
      {
        title: '오늘의 회의실 예약 현황',
        description,
      },
    ],
  };

  return sendNotification(message);
}

export default {
  sendNotification,
  sendTextNotification,
  sendCardNotification,
  notifyBookingCreated,
  notifyBookingCancelled,
  notifyMeetingSoon,
  notifyNoShow,
  notifyOvertime,
  sendDailyBriefing,
};

