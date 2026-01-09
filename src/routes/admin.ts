import { Router, Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as db from '../services/database.js';
import type { Room } from '../types/index.js';

const router = Router();

/**
 * 간단한 API 키 인증 (실제 운영 시 더 강화 필요)
 */
function requireAdminAuth(req: Request, res: Response, next: Function): void {
  const apiKey = req.headers['x-api-key'] as string;
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey || apiKey !== adminKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

/**
 * GET /admin/rooms
 * 모든 회의실 목록 조회
 */
router.get('/rooms', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const rooms = db.getAllRooms();
    res.json({ success: true, data: rooms });
  } catch (error: any) {
    logger.error('회의실 목록 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /admin/rooms
 * 새 회의실 등록
 */
router.post('/rooms', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { name, displayName, email, calendarId, capacity, location, autoAccept } = req.body;

    if (!name || !displayName || !email || !calendarId) {
      res.status(400).json({ 
        success: false, 
        error: 'name, displayName, email, calendarId는 필수입니다.' 
      });
      return;
    }

    const room = db.createRoom({
      name,
      displayName,
      email,
      calendarId,
      capacity: capacity || 0,
      location: location || '',
      autoAccept: autoAccept !== false,
    });

    logger.info('회의실 등록', { room: room.name });
    res.status(201).json({ success: true, data: room });
  } catch (error: any) {
    logger.error('회의실 등록 실패', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /admin/rooms/:id
 * 회의실 정보 수정
 */
router.put('/rooms/:id', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updates = req.body;

    const room = db.updateRoom(id, updates);
    if (!room) {
      res.status(404).json({ success: false, error: '회의실을 찾을 수 없습니다.' });
      return;
    }

    logger.info('회의실 수정', { room: room.name });
    res.json({ success: true, data: room });
  } catch (error: any) {
    logger.error('회의실 수정 실패', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /admin/bookings
 * 예약 목록 조회
 */
router.get('/bookings', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { date, roomId, userEmail } = req.query;

    let bookings;
    if (date) {
      bookings = db.getBookingsByDate(
        date as string, 
        roomId ? parseInt(roomId as string, 10) : undefined
      );
    } else if (userEmail) {
      bookings = db.getBookingsByUser(userEmail as string);
    } else {
      // 오늘 날짜 기본값
      const today = new Date().toISOString().split('T')[0];
      bookings = db.getBookingsByDate(today);
    }

    res.json({ success: true, data: bookings });
  } catch (error: any) {
    logger.error('예약 목록 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /admin/bookings/:bookingId
 * 특정 예약 조회
 */
router.get('/bookings/:bookingId', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const booking = db.getBookingById(bookingId);

    if (!booking) {
      res.status(404).json({ success: false, error: '예약을 찾을 수 없습니다.' });
      return;
    }

    const room = db.getRoomById(booking.roomId);
    res.json({ success: true, data: { ...booking, room } });
  } catch (error: any) {
    logger.error('예약 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /admin/logs
 * 감사 로그 조회
 */
router.get('/logs', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const logs = db.getRecentLogs(limit);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    logger.error('로그 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /admin/stats
 * 통계 정보 조회
 */
router.get('/stats', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const rooms = db.getAllRooms();
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = db.getBookingsByDate(today);

    res.json({
      success: true,
      data: {
        totalRooms: rooms.length,
        todayBookings: todayBookings.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('통계 조회 실패', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

