/**
 * 데이터베이스 초기화 및 샘플 데이터 삽입 스크립트
 * 
 * 실행: npm run db:init
 */

import { initializeDatabase, createRoom, getAllRooms } from '../services/database.js';
import { logger } from '../utils/logger.js';

// 회의실 데이터 (대 회의실, 소 회의실 2개)
const sampleRooms = [
  {
    name: '대',
    displayName: '대 회의실',
    email: 'room-large@your-domain.com',
    calendarId: 'room-large@your-domain.com',
    capacity: 12,
    location: '2층',
    autoAccept: true,
  },
  {
    name: '소',
    displayName: '소 회의실',
    email: 'room-small@your-domain.com',
    calendarId: 'room-small@your-domain.com',
    capacity: 4,
    location: '2층',
    autoAccept: true,
  },
];

async function main(): Promise<void> {
  console.log('='.repeat(50));
  console.log('JANDI 회의실 예약 봇 - 데이터베이스 초기화');
  console.log('='.repeat(50));
  console.log();

  try {
    // 데이터베이스 초기화
    initializeDatabase();
    console.log('✅ 데이터베이스 테이블 생성 완료');

    // 기존 회의실 확인
    const existingRooms = getAllRooms();
    
    if (existingRooms.length > 0) {
      console.log(`\n📋 기존 회의실 ${existingRooms.length}개 발견:`);
      existingRooms.forEach((room) => {
        console.log(`   - ${room.name}: ${room.displayName} (${room.location})`);
      });
      
      console.log('\n⚠️  기존 데이터가 있어 샘플 데이터를 삽입하지 않습니다.');
      console.log('   새로운 회의실을 추가하려면 Admin API를 사용하세요.');
    } else {
      // 샘플 데이터 삽입
      console.log('\n📝 샘플 회의실 데이터 삽입 중...');
      
      for (const roomData of sampleRooms) {
        try {
          const room = createRoom(roomData);
          console.log(`   ✅ ${room.name}: ${room.displayName}`);
        } catch (error: any) {
          console.log(`   ❌ ${roomData.name}: ${error.message}`);
        }
      }
      
      console.log('\n✅ 샘플 데이터 삽입 완료');
    }

    console.log('\n' + '='.repeat(50));
    console.log('⚙️  다음 단계:');
    console.log('   1. env.sample 파일을 .env로 복사');
    console.log('   2. .env 파일에서 실제 설정값 입력:');
    console.log('      - JANDI_OUTGOING_TOKEN');
    console.log('      - Google Calendar API 인증 정보');
    console.log('   3. 회의실 이메일/캘린더ID를 실제 값으로 업데이트');
    console.log('   4. npm run dev 로 서버 시작');
    console.log('='.repeat(50));

  } catch (error: any) {
    console.error('❌ 초기화 실패:', error.message);
    process.exit(1);
  }
}

main();

