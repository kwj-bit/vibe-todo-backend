const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

// 디버깅: 환경변수 로드 확인
console.log('=== 애플리케이션 시작 ===');
console.log('환경변수 MONGODB_URI:', process.env.MONGODB_URI ? '로드됨' : '로드 실패');
if (process.env.MONGODB_URI) {
  // 민감한 정보는 숨기고 형식만 확인
  const uri = process.env.MONGODB_URI;
  const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
  console.log('MONGODB_URI 형식:', maskedUri.substring(0, 50) + '...');
  console.log('URI 길이:', uri.length);
}

const app = express();

app.use(express.json());

// CORS (allow all origins for development)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Handle preflight quickly
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Todo Backend API',
    status: 'running',
    endpoints: {
      health: '/health',
      todos: '/todos'
    }
  });
});

app.get('/health', (req, res) => {
  const readyState = mongoose.connection.readyState;
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  const mongoStatus = stateMap[readyState] || 'unknown';
  const isConnected = readyState === 1;
  
  res.json({ 
    status: 'ok',
    mongodb: {
      status: mongoStatus,
      readyState: readyState,
      connected: isConnected,
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null
    },
    connectionAttempts: connectionAttempts,
    maxConnectionAttempts: maxConnectionAttempts,
    hasMongoUri: !!process.env.MONGODB_URI,
    lastError: lastError ? {
      name: lastError.name,
      message: lastError.message,
      time: lastErrorTime
    } : null,
    mongoUriFormat: process.env.MONGODB_URI ? 
      process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@') : null
  });
});

// MongoDB 연결 상태 체크 미들웨어
const checkMongoConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ 
      message: '서비스 일시 중단',
      error: 'MongoDB에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
      details: 'Database connection unavailable'
    });
  }
  next();
};

// routes - MongoDB 연결 체크 미들웨어 추가
app.use('/todos', checkMongoConnection, require('./routes/todos'));

const port = process.env.PORT || 5000;
let mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo';

if (!process.env.MONGODB_URI) {
  console.warn('⚠️  경고: 환경변수 MONGODB_URI가 설정되지 않았습니다. 기본값을 사용합니다.');
} else {
  console.log('✅ 환경변수에서 MongoDB URI를 사용합니다.');
  // URI 정규화: 마지막 슬래시 제거
  mongoUri = mongoUri.trim();
  if (mongoUri.endsWith('/')) {
    mongoUri = mongoUri.slice(0, -1);
  }
  // URI에 연결 옵션이 없으면 기본 옵션 추가 (재시도 및 쓰기 확인)
  if (!mongoUri.includes('?')) {
    mongoUri = mongoUri + '?retryWrites=true&w=majority';
  }
  console.log('🔗 MongoDB URI (정규화됨):', mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
}

// 서버를 먼저 시작
const server = app.listen(port, () => {
  console.log(`서버가 ${port}번 포트에서 실행 중입니다.`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`\n❌ 포트 ${port}가 이미 사용 중입니다. (EADDRINUSE)`);
    console.error('\n해결 방법:');
    console.error(`1. .env 파일에 PORT=3000 (또는 다른 포트) 추가`);
    console.error(`2. 또는 포트 ${port}를 사용 중인 프로세스를 종료`);
    console.error(`   Windows: netstat -ano | findstr :${port} 로 PID 확인 후 taskkill /PID [PID] /F`);
    process.exit(1);
  }
  console.error('서버 에러:', err);
  process.exit(1);
});

// MongoDB 연결 옵션 개선 (Heroku 환경에 최적화)
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000, // 30초 (무료 티어 sleep 대응)
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  w: 'majority',
  maxPoolSize: 10,
  minPoolSize: 1,
  // 무료 티어 클러스터가 sleep 상태일 경우를 대비한 옵션
  bufferCommands: false,
  bufferMaxEntries: 0
};

// MongoDB 연결 상태 추적
let isMongoConnected = false;
let connectionAttempts = 0;
const maxConnectionAttempts = 10; // 재시도 횟수 증가
let lastError = null; // 마지막 에러 저장
let lastErrorTime = null;

// 연결 함수
const connectMongoDB = async () => {
  // 이미 연결 중이면 재시도하지 않음
  if (mongoose.connection.readyState === 1) {
    console.log('✅ MongoDB 이미 연결되어 있습니다.');
    isMongoConnected = true;
    connectionAttempts = 0;
    lastError = null;
    return;
  }

  // 연결 중이면 대기
  if (mongoose.connection.readyState === 2) {
    console.log('⏳ MongoDB 연결 중... 대기합니다.');
    return;
  }

  // 최대 재시도 횟수 초과 시 더 이상 시도하지 않음
  if (connectionAttempts >= maxConnectionAttempts) {
    console.error(`❌ 최대 재시도 횟수(${maxConnectionAttempts})에 도달했습니다. 수동으로 재시도해주세요.`);
    return;
  }

  connectionAttempts++;
  const attemptNum = connectionAttempts;
  console.log(`🔄 MongoDB 연결 시도 ${attemptNum}/${maxConnectionAttempts}`);
  console.log(`   URI: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`);
  console.log(`   타임아웃: ${mongooseOptions.serverSelectionTimeoutMS}ms`);

  try {
    await mongoose.connect(mongoUri, mongooseOptions);
    // 연결 성공은 'connected' 이벤트에서 처리됨
  } catch (err) {
    isMongoConnected = false;
    lastError = {
      name: err.name,
      message: err.message,
      code: err.code || 'N/A'
    };
    lastErrorTime = new Date().toISOString();
    
    console.error(`❌ MongoDB 연결 실패 (시도 ${attemptNum}/${maxConnectionAttempts})`);
    console.error(`   에러 이름: ${err.name}`);
    console.error(`   에러 메시지: ${err.message}`);
    console.error(`   에러 코드: ${err.code || 'N/A'}`);
    
    if (err.name === 'MongoServerSelectionError') {
      console.error('   💡 서버 선택 오류');
      console.error('      1. MongoDB Atlas IP 화이트리스트: 0.0.0.0/0 확인');
      console.error('      2. 클러스터 상태: 실행 중인지 확인 (무료 티어 sleep 가능)');
      console.error('      3. URI 형식 확인');
    } else if (err.name === 'MongoAuthenticationError') {
      console.error('   💡 인증 오류');
      console.error('      1. 사용자 이름/비밀번호 확인');
      console.error('      2. Database Access 권한 확인');
    } else if (err.name === 'MongoNetworkError' || err.name === 'MongoNetworkTimeoutError') {
      console.error('   💡 네트워크 오류');
      console.error('      1. IP 화이트리스트 확인');
      console.error('      2. 네트워크 연결 확인');
    }
    
    // 전체 에러 스택 출력 (디버깅용)
    if (err.stack) {
      console.error('   에러 스택:', err.stack.split('\n').slice(0, 5).join('\n'));
    }

    // 재시도 로직
    if (connectionAttempts < maxConnectionAttempts) {
      const delay = Math.min(2000 * connectionAttempts, 15000); // 최대 15초
      console.log(`   ⏳ ${delay / 1000}초 후 재시도...`);
      setTimeout(() => {
        connectMongoDB();
      }, delay);
    } else {
      console.error(`   ❌ 최대 재시도 횟수(${maxConnectionAttempts}) 도달. 자동 재시도 중지.`);
      console.error('   💡 해결 방법:');
      console.error('      1. Heroku 런타임 로그 확인: heroku logs --tail --app vibe-todo-backend2');
      console.error('      2. MongoDB Atlas 클러스터 상태 확인');
      console.error('      3. 환경변수 MONGODB_URI 재확인');
    }
  }
};

// MongoDB 연결 이벤트 리스너
mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  console.log('✅ MongoDB 연결됨');
});

mongoose.connection.on('error', (err) => {
  isMongoConnected = false;
  console.error('❌ MongoDB 연결 에러:', err.message);
});

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.warn('⚠️  MongoDB 연결 끊김');
  // 자동 재연결은 connectMongoDB 함수 내에서 처리
  // 여기서는 카운터를 리셋하지 않고 재연결 시도
  if (connectionAttempts < maxConnectionAttempts) {
    console.log('   재연결 시도...');
    setTimeout(() => {
      connectMongoDB();
    }, 3000);
  }
});

// 초기 연결 시도
connectMongoDB();


