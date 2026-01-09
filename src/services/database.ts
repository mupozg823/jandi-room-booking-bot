import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { Room, Booking, AuditLog, CommandType } from '../types/index.js';

// 데이터베이스 디렉토리 확인/생성
const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 데이터베이스 연결
const db: DatabaseType = new Database(config.database.path);
db.pragma('journal_mode = WAL');

// 테이블 생성
export function initializeDatabase(): void {
  logger.info('데이터베이스 초기화 중...');
  
  // 회의실 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      calendar_id TEXT NOT NULL,
      capacity INTEGER DEFAULT 0,
      location TEXT DEFAULT '',
      auto_accept BOOLEAN DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // 예약 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id TEXT UNIQUE NOT NULL,
      room_id INTEGER NOT NULL,
      calendar_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      requested_by TEXT NOT NULL,
      requested_by_name TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    )
  `);
  
  // 인덱스 생성
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
    CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_requested_by ON bookings(requested_by);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  `);
  
  // 감사 로그 테이블
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      user_name TEXT DEFAULT '',
      command TEXT NOT NULL,
      command_type TEXT NOT NULL,
      parameters TEXT DEFAULT '{}',
      status TEXT NOT NULL,
      response TEXT DEFAULT '',
      error_message TEXT,
      ip_address TEXT DEFAULT '',
      room_name TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now'))
    )
  `);
  
  logger.info('데이터베이스 초기화 완료');
}

// ==================== 회의실 관련 ====================

export function getAllRooms(): Room[] {
  const stmt = db.prepare(`
    SELECT 
      id, name, display_name as displayName, email, calendar_id as calendarId,
      capacity, location, auto_accept as autoAccept, created_at as createdAt, updated_at as updatedAt
    FROM rooms
    ORDER BY name
  `);
  return stmt.all() as Room[];
}

export function getRoomByName(name: string): Room | undefined {
  const stmt = db.prepare(`
    SELECT 
      id, name, display_name as displayName, email, calendar_id as calendarId,
      capacity, location, auto_accept as autoAccept, created_at as createdAt, updated_at as updatedAt
    FROM rooms
    WHERE LOWER(name) = LOWER(?)
  `);
  return stmt.get(name) as Room | undefined;
}

export function getRoomById(id: number): Room | undefined {
  const stmt = db.prepare(`
    SELECT 
      id, name, display_name as displayName, email, calendar_id as calendarId,
      capacity, location, auto_accept as autoAccept, created_at as createdAt, updated_at as updatedAt
    FROM rooms
    WHERE id = ?
  `);
  return stmt.get(id) as Room | undefined;
}

export function createRoom(room: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>): Room {
  const stmt = db.prepare(`
    INSERT INTO rooms (name, display_name, email, calendar_id, capacity, location, auto_accept)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    room.name,
    room.displayName,
    room.email,
    room.calendarId,
    room.capacity,
    room.location,
    room.autoAccept ? 1 : 0
  );
  
  return getRoomById(result.lastInsertRowid as number)!;
}

export function updateRoom(id: number, updates: Partial<Room>): Room | undefined {
  const fields: string[] = [];
  const values: (string | number | boolean)[] = [];
  
  if (updates.displayName !== undefined) {
    fields.push('display_name = ?');
    values.push(updates.displayName);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  if (updates.calendarId !== undefined) {
    fields.push('calendar_id = ?');
    values.push(updates.calendarId);
  }
  if (updates.capacity !== undefined) {
    fields.push('capacity = ?');
    values.push(updates.capacity);
  }
  if (updates.location !== undefined) {
    fields.push('location = ?');
    values.push(updates.location);
  }
  if (updates.autoAccept !== undefined) {
    fields.push('auto_accept = ?');
    values.push(updates.autoAccept ? 1 : 0);
  }
  
  if (fields.length === 0) return getRoomById(id);
  
  fields.push("updated_at = datetime('now')");
  values.push(id);
  
  const stmt = db.prepare(`
    UPDATE rooms SET ${fields.join(', ')} WHERE id = ?
  `);
  stmt.run(...values);
  
  return getRoomById(id);
}

// ==================== 예약 관련 ====================

export function getBookingById(bookingId: string): Booking | undefined {
  const stmt = db.prepare(`
    SELECT 
      id, booking_id as bookingId, room_id as roomId, calendar_id as calendarId,
      event_id as eventId, title, date, start_time as startTime, end_time as endTime,
      duration_minutes as durationMinutes, requested_by as requestedBy,
      requested_by_name as requestedByName, status, created_at as createdAt, updated_at as updatedAt
    FROM bookings
    WHERE booking_id = ?
  `);
  return stmt.get(bookingId) as Booking | undefined;
}

export function getBookingsByDate(date: string, roomId?: number): Booking[] {
  let query = `
    SELECT 
      id, booking_id as bookingId, room_id as roomId, calendar_id as calendarId,
      event_id as eventId, title, date, start_time as startTime, end_time as endTime,
      duration_minutes as durationMinutes, requested_by as requestedBy,
      requested_by_name as requestedByName, status, created_at as createdAt, updated_at as updatedAt
    FROM bookings
    WHERE date = ? AND status = 'active'
  `;
  
  const params: (string | number)[] = [date];
  
  if (roomId !== undefined) {
    query += ' AND room_id = ?';
    params.push(roomId);
  }
  
  query += ' ORDER BY start_time';
  
  const stmt = db.prepare(query);
  return stmt.all(...params) as Booking[];
}

export function getBookingsByUser(userEmail: string, filter: 'today' | 'week' | 'all' = 'all'): Booking[] {
  let dateCondition = '';
  
  if (filter === 'today') {
    dateCondition = "AND date = date('now')";
  } else if (filter === 'week') {
    dateCondition = "AND date BETWEEN date('now') AND date('now', '+7 days')";
  }
  
  const stmt = db.prepare(`
    SELECT 
      id, booking_id as bookingId, room_id as roomId, calendar_id as calendarId,
      event_id as eventId, title, date, start_time as startTime, end_time as endTime,
      duration_minutes as durationMinutes, requested_by as requestedBy,
      requested_by_name as requestedByName, status, created_at as createdAt, updated_at as updatedAt
    FROM bookings
    WHERE requested_by = ? AND status = 'active' ${dateCondition}
    ORDER BY date, start_time
  `);
  return stmt.all(userEmail) as Booking[];
}

export function createBooking(booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Booking {
  const stmt = db.prepare(`
    INSERT INTO bookings (
      booking_id, room_id, calendar_id, event_id, title, date, 
      start_time, end_time, duration_minutes, requested_by, requested_by_name, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    booking.bookingId,
    booking.roomId,
    booking.calendarId,
    booking.eventId,
    booking.title,
    booking.date,
    booking.startTime,
    booking.endTime,
    booking.durationMinutes,
    booking.requestedBy,
    booking.requestedByName,
    booking.status
  );
  
  return { ...booking, id: result.lastInsertRowid as number, createdAt: '', updatedAt: '' };
}

export function updateBookingStatus(bookingId: string, status: 'active' | 'cancelled' | 'completed'): boolean {
  const stmt = db.prepare(`
    UPDATE bookings 
    SET status = ?, updated_at = datetime('now')
    WHERE booking_id = ?
  `);
  const result = stmt.run(status, bookingId);
  return result.changes > 0;
}

export function updateBookingEventId(bookingId: string, eventId: string): boolean {
  const stmt = db.prepare(`
    UPDATE bookings
    SET event_id = ?, updated_at = datetime('now')
    WHERE booking_id = ?
  `);
  const result = stmt.run(eventId, bookingId);
  return result.changes > 0;
}

/**
 * 특정 회의실의 시간 충돌 체크 (DB 기반)
 * @param roomId 회의실 ID
 * @param date 날짜 (YYYY-MM-DD)
 * @param startTime 시작 시간 (HH:mm)
 * @param endTime 종료 시간 (HH:mm)
 * @param excludeBookingId 제외할 예약 ID (수정 시 자기 자신 제외)
 * @returns 충돌하는 예약이 없으면 true
 */
export function checkRoomAvailability(
  roomId: number,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): boolean {
  let query = `
    SELECT COUNT(*) as count
    FROM bookings
    WHERE room_id = ?
      AND date = ?
      AND status = 'active'
      AND (
        (start_time < ? AND end_time > ?)
        OR (start_time < ? AND end_time > ?)
        OR (start_time >= ? AND end_time <= ?)
      )
  `;

  const params: (string | number)[] = [
    roomId, date,
    endTime, startTime,  // 기존 예약이 새 예약 시작 전에 시작하고 시작 후에 끝남
    endTime, endTime,    // 기존 예약이 새 예약 종료 전에 시작하고 종료 후에 끝남
    startTime, endTime   // 기존 예약이 새 예약 안에 완전히 포함됨
  ];

  if (excludeBookingId) {
    query += ' AND booking_id != ?';
    params.push(excludeBookingId);
  }

  const stmt = db.prepare(query);
  const result = stmt.get(...params) as { count: number };

  return result.count === 0;
}

/**
 * 특정 날짜/시간대의 모든 회의실 가용성 조회
 */
export function getRoomsAvailability(
  date: string,
  startTime: string,
  endTime: string
): { room: Room; available: boolean; bookings: Booking[] }[] {
  const rooms = getAllRooms();

  return rooms.map(room => {
    const bookings = getBookingsByDate(date, room.id);
    const available = checkRoomAvailability(room.id, date, startTime, endTime);
    return { room, available, bookings };
  });
}

/**
 * 예약 시간 업데이트 (move 명령용)
 */
export function updateBookingTime(
  bookingId: string,
  date: string,
  startTime: string,
  endTime: string
): boolean {
  const stmt = db.prepare(`
    UPDATE bookings
    SET date = ?, start_time = ?, end_time = ?, updated_at = datetime('now')
    WHERE booking_id = ?
  `);
  const result = stmt.run(date, startTime, endTime, bookingId);
  return result.changes > 0;
}

/**
 * 예약 종료 시간 업데이트 (extend 명령용)
 */
export function updateBookingEndTime(
  bookingId: string,
  endTime: string,
  durationMinutes: number
): boolean {
  const stmt = db.prepare(`
    UPDATE bookings
    SET end_time = ?, duration_minutes = ?, updated_at = datetime('now')
    WHERE booking_id = ?
  `);
  const result = stmt.run(endTime, durationMinutes, bookingId);
  return result.changes > 0;
}

// ==================== 감사 로그 관련 ====================

export function createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): void {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      user_email, user_name, command, command_type, parameters,
      status, response, error_message, ip_address, room_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    log.userEmail,
    log.userName,
    log.command,
    log.commandType,
    log.parameters,
    log.status,
    log.response,
    log.errorMessage || null,
    log.ipAddress,
    log.roomName
  );
}

export function getRecentLogs(limit: number = 100): AuditLog[] {
  const stmt = db.prepare(`
    SELECT 
      id, user_email as userEmail, user_name as userName, command, command_type as commandType,
      parameters, status, response, error_message as errorMessage, ip_address as ipAddress,
      room_name as roomName, timestamp
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as AuditLog[];
}

// 데이터베이스 인스턴스 내보내기 (고급 쿼리용)
export { db };

// 자동 초기화
initializeDatabase();

export default {
  initializeDatabase,
  getAllRooms,
  getRoomByName,
  getRoomById,
  createRoom,
  updateRoom,
  getBookingById,
  getBookingsByDate,
  getBookingsByUser,
  createBooking,
  updateBookingStatus,
  updateBookingEventId,
  checkRoomAvailability,
  getRoomsAvailability,
  updateBookingTime,
  updateBookingEndTime,
  createAuditLog,
  getRecentLogs,
};

