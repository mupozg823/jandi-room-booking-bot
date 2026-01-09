import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { bookingPolicy } from '../config/index.js';
import type {
  ParsedCommand,
  CommandType,
  BookCommandArgs,
  CancelCommandArgs,
  StatusCommandArgs,
  MyCommandArgs,
} from '../types/index.js';

dayjs.extend(customParseFormat);

/**
 * 명령어 파싱 결과
 */
interface ParseResult {
  success: boolean;
  command?: ParsedCommand;
  error?: string;
}

/**
 * 한국어 명령어를 영어로 매핑
 */
const commandMap: Record<string, CommandType> = {
  // 한국어 명령어
  '현황': 'status',
  '조회': 'status',
  '예약': 'book',
  '취소': 'cancel',
  '변경': 'move',
  '연장': 'extend',
  '내예약': 'my',
  '내꺼': 'my',
  '목록': 'list',
  '도움말': 'help',
  '도움': 'help',
  '?': 'help',
  // 영어 명령어 (호환성)
  'status': 'status',
  'book': 'book',
  'cancel': 'cancel',
  'move': 'move',
  'extend': 'extend',
  'my': 'my',
  'list': 'list',
  'help': 'help',
};

/**
 * 데이터 문자열에서 명령어 파싱
 *
 * 지원 명령어 (한국어):
 * - 현황 [오늘|날짜|시간범위]
 * - 예약 <회의실> <날짜> <시작시간> <길이(분)> "<제목>"
 * - 취소 <예약ID>
 * - 변경 <예약ID> <새날짜> <새시작시간>
 * - 연장 <예약ID> <추가시간(분)>
 * - 내예약 [오늘|이번주]
 * - 목록 [날짜]
 * - 도움말
 */
export function parseCommand(data: string): ParseResult {
  const trimmedData = data.trim();

  if (!trimmedData) {
    return {
      success: true,
      command: { type: 'help', args: {}, raw: '' },
    };
  }

  // 첫 번째 단어로 명령어 타입 결정
  const parts = splitCommandParts(trimmedData);
  const inputCommand = parts[0]?.toLowerCase();
  const commandType = commandMap[inputCommand];
  const args = parts.slice(1);

  if (!commandType) {
    return {
      success: false,
      error: `알 수 없는 명령어: "${inputCommand}"\n\n사용법: 현황 | 예약 | 취소 | 내예약 | 도움말`,
    };
  }

  switch (commandType) {
    case 'help':
      return parseHelpCommand(trimmedData);
    case 'status':
      return parseStatusCommand(args, trimmedData);
    case 'book':
      return parseBookCommand(args, trimmedData);
    case 'cancel':
      return parseCancelCommand(args, trimmedData);
    case 'move':
      return parseMoveCommand(args, trimmedData);
    case 'extend':
      return parseExtendCommand(args, trimmedData);
    case 'my':
      return parseMyCommand(args, trimmedData);
    case 'list':
      return parseListCommand(args, trimmedData);
    default:
      return {
        success: false,
        error: `알 수 없는 명령어: "${inputCommand}"\n\n사용법: 현황 | 예약 | 취소 | 내예약 | 도움말`,
      };
  }
}

/**
 * 명령어 문자열을 파트로 분리 (따옴표 내 공백 유지)
 */
function splitCommandParts(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * help 명령어 파싱
 */
function parseHelpCommand(raw: string): ParseResult {
  return {
    success: true,
    command: { type: 'help', args: {}, raw },
  };
}

/**
 * 한국어 날짜 키워드 파싱
 */
function parseKoreanDate(arg: string): string | null {
  const lower = arg.toLowerCase();
  if (lower === 'today' || lower === '오늘') {
    return dayjs().format('YYYY-MM-DD');
  }
  if (lower === 'tomorrow' || lower === '내일') {
    return dayjs().add(1, 'day').format('YYYY-MM-DD');
  }
  // YYYY-MM-DD 형식 확인
  const parsed = dayjs(arg, 'YYYY-MM-DD', true);
  if (parsed.isValid()) {
    return parsed.format('YYYY-MM-DD');
  }
  return null;
}

/**
 * status/현황 명령어 파싱
 * - 현황
 * - 현황 오늘
 * - 현황 2026-01-07
 * - 현황 09:00-18:00
 */
function parseStatusCommand(args: string[], raw: string): ParseResult {
  const statusArgs: StatusCommandArgs = {};

  if (args.length === 0 || args[0]?.toLowerCase() === 'today' || args[0] === '오늘') {
    statusArgs.date = dayjs().format('YYYY-MM-DD');
  } else if (args.length >= 1) {
    const firstArg = args[0];

    // 시간 범위인지 확인 (HH:mm-HH:mm)
    if (firstArg.includes('-') && firstArg.includes(':')) {
      statusArgs.date = dayjs().format('YYYY-MM-DD');
      statusArgs.timeRange = firstArg;
    } else {
      // 날짜로 파싱 시도
      const date = parseKoreanDate(firstArg);
      if (date) {
        statusArgs.date = date;
      } else {
        return {
          success: false,
          error: `잘못된 날짜: "${firstArg}"\n예시: 현황 오늘 / 현황 2026-01-07`,
        };
      }
    }

    // 두 번째 인자가 있으면 시간 범위
    if (args.length >= 2) {
      statusArgs.timeRange = args[1];
    }
  }

  return {
    success: true,
    command: { type: 'status', args: statusArgs as Record<string, string | number | undefined>, raw },
  };
}

/**
 * book/예약 명령어 파싱
 * - 예약 <회의실> <날짜> <시작시간> <길이(분)> "<제목>"
 * - 예약 대 오늘 14:00 60 "주간회의"
 * - 예약 소 내일 10:00 30 "미팅"
 */
function parseBookCommand(args: string[], raw: string): ParseResult {
  if (args.length < 5) {
    return {
      success: false,
      error: `예약 형식이 올바르지 않습니다.\n\n사용법: 예약 <회의실> <날짜> <시간> <분> "<제목>"\n예시: 예약 대 오늘 14:00 60 "회의"`,
    };
  }

  const [roomName, dateArg, startTime, durationStr, ...titleParts] = args;

  // 날짜 파싱
  const date = parseKoreanDate(dateArg);
  if (!date) {
    return {
      success: false,
      error: `잘못된 날짜: "${dateArg}"\n예시: 오늘, 내일, 2026-01-07`,
    };
  }

  // 시작 시간 검증
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime)) {
    return {
      success: false,
      error: `잘못된 시간 형식입니다: "${startTime}"\n예시: 14:00`,
    };
  }

  // 길이 파싱
  const duration = parseInt(durationStr, 10);
  if (isNaN(duration) || duration <= 0) {
    return {
      success: false,
      error: `잘못된 길이입니다: "${durationStr}"\n분 단위 숫자를 입력하세요. 예: 60`,
    };
  }

  // 정책 검증
  if (duration < bookingPolicy.minDurationMinutes) {
    return {
      success: false,
      error: `최소 예약 시간은 ${bookingPolicy.minDurationMinutes}분입니다.`,
    };
  }
  if (duration > bookingPolicy.maxDurationMinutes) {
    return {
      success: false,
      error: `최대 예약 시간은 ${bookingPolicy.maxDurationMinutes}분입니다.`,
    };
  }

  // 제목
  const title = titleParts.join(' ').trim() || '회의';

  const bookArgs: BookCommandArgs = {
    roomName,
    date,
    startTime,
    duration,
    title,
  };

  return {
    success: true,
    command: { type: 'book', args: bookArgs as unknown as Record<string, string | number | undefined>, raw },
  };
}

/**
 * cancel/취소 명령어 파싱
 * - 취소 <예약ID>
 * - 취소 R-12345
 */
function parseCancelCommand(args: string[], raw: string): ParseResult {
  if (args.length < 1) {
    return {
      success: false,
      error: `취소할 예약 ID를 입력하세요.\n\n사용법: 취소 <예약ID>\n예시: 취소 R-12345`,
    };
  }

  const bookingId = args[0].toUpperCase();

  const cancelArgs: CancelCommandArgs = { bookingId };

  return {
    success: true,
    command: { type: 'cancel', args: cancelArgs as unknown as Record<string, string | number | undefined>, raw },
  };
}

/**
 * move/변경 명령어 파싱
 * - 변경 <예약ID> <새날짜> <새시작시간>
 */
function parseMoveCommand(args: string[], raw: string): ParseResult {
  if (args.length < 3) {
    return {
      success: false,
      error: `변경 형식이 올바르지 않습니다.\n\n사용법: 변경 <예약ID> <날짜> <시간>\n예시: 변경 R-12345 내일 15:00`,
    };
  }

  const [bookingId, dateArg, startTime] = args;

  // 날짜 파싱
  const date = parseKoreanDate(dateArg);
  if (!date) {
    return {
      success: false,
      error: `잘못된 날짜: "${dateArg}"\n예시: 오늘, 내일, 2026-01-08`,
    };
  }

  // 시간 검증
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime)) {
    return {
      success: false,
      error: `잘못된 시간: "${startTime}"\n예시: 15:00`,
    };
  }

  return {
    success: true,
    command: {
      type: 'move',
      args: {
        bookingId: bookingId.toUpperCase(),
        date,
        startTime,
      },
      raw,
    },
  };
}

/**
 * extend/연장 명령어 파싱
 * - 연장 <예약ID> <추가시간(분)>
 */
function parseExtendCommand(args: string[], raw: string): ParseResult {
  if (args.length < 2) {
    return {
      success: false,
      error: `연장 형식이 올바르지 않습니다.\n\n사용법: 연장 <예약ID> <분>\n예시: 연장 R-12345 30`,
    };
  }

  const [bookingId, additionalMinutesStr] = args;
  const additionalMinutes = parseInt(additionalMinutesStr, 10);

  if (isNaN(additionalMinutes) || additionalMinutes <= 0) {
    return {
      success: false,
      error: `잘못된 시간: "${additionalMinutesStr}"\n분 단위 숫자를 입력하세요.`,
    };
  }

  return {
    success: true,
    command: {
      type: 'extend',
      args: {
        bookingId: bookingId.toUpperCase(),
        additionalMinutes,
      },
      raw,
    },
  };
}

/**
 * my/내예약 명령어 파싱
 * - 내예약
 * - 내예약 오늘
 * - 내예약 이번주
 */
function parseMyCommand(args: string[], raw: string): ParseResult {
  let filter: 'today' | 'week' | 'all' = 'all';

  if (args.length >= 1) {
    const filterArg = args[0].toLowerCase();
    // 한국어 + 영어 필터 지원
    if (filterArg === 'today' || filterArg === '오늘') {
      filter = 'today';
    } else if (filterArg === 'week' || filterArg === '이번주') {
      filter = 'week';
    } else if (filterArg === 'all' || filterArg === '전체') {
      filter = 'all';
    }
  }

  const myArgs: MyCommandArgs = { filter };

  return {
    success: true,
    command: { type: 'my', args: myArgs as unknown as Record<string, string | number | undefined>, raw },
  };
}

/**
 * list/목록 명령어 파싱 (회의실 목록 또는 특정 날짜 예약 목록)
 * - 목록
 * - 목록 회의실
 * - 목록 2026-01-07
 */
function parseListCommand(args: string[], raw: string): ParseResult {
  if (args.length === 0 || args[0]?.toLowerCase() === 'rooms' || args[0] === '회의실') {
    return {
      success: true,
      command: { type: 'list', args: { target: 'rooms' }, raw },
    };
  }

  // 날짜로 파싱 시도
  const dateArg = args[0];
  const date = parseKoreanDate(dateArg);
  
  if (!date) {
    return {
      success: false,
      error: `잘못된 날짜: "${dateArg}"\n예시: 목록 오늘 / 목록 2026-01-07`,
    };
  }

  return {
    success: true,
    command: { type: 'list', args: { target: 'bookings', date }, raw },
  };
}

/**
 * 도움말 메시지 생성
 */
export function getHelpMessage(): string {
  return `📋 **회의실 예약 봇 사용법**

🔍 **현황**
\`현황\` - 오늘 회의실 현황
\`현황 내일\` - 내일 현황
\`현황 2026-01-07\` - 특정 날짜

📅 **예약**
\`예약 대 오늘 14:00 60 "회의"\`
\`예약 소 내일 10:00 30 "미팅"\`
→ 회의실명, 날짜, 시간, 분, 제목

❌ **취소**
\`취소 R-XXXX\`

🔄 **변경**
\`변경 R-XXXX 내일 15:00\`

⏰ **연장**
\`연장 R-XXXX 30\`

👤 **내예약**
\`내예약\` - 전체
\`내예약 오늘\` - 오늘만
\`내예약 이번주\` - 이번 주

📝 **목록**
\`목록\` - 회의실 목록

❓ **도움말**
\`도움말\` 또는 \`?\``;
}

export default {
  parseCommand,
  getHelpMessage,
};

