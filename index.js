const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

// 디버깅: 환경변수 로드 확인
console.log('환경변수 MONGODB_URI:', process.env.MONGODB_URI ? '로드됨' : '로드 실패');

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
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok',
    mongodb: mongoStatus,
    readyState: mongoose.connection.readyState // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
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
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo';

if (!process.env.MONGODB_URI) {
  console.warn('⚠️  경고: 환경변수 MONGODB_URI가 설정되지 않았습니다. 기본값을 사용합니다.');
} else {
  console.log('✅ 환경변수에서 MongoDB URI를 사용합니다.');
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

// MongoDB 연결 옵션 개선
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000, // 5초 타임아웃
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority'
};

// MongoDB 연결 상태 추적
let isMongoConnected = false;

mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  console.log('✅ MongoDB 연결 성공');
});

mongoose.connection.on('error', (err) => {
  isMongoConnected = false;
  console.error('❌ MongoDB 연결 에러:', err.message);
});

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.warn('⚠️  MongoDB 연결 끊김');
});

// MongoDB 연결 (비동기로 처리)
mongoose
  .connect(mongoUri, mongooseOptions)
  .then(() => {
    isMongoConnected = true;
  })
  .catch((err) => {
    isMongoConnected = false;
    console.error('❌ MongoDB 초기 연결 실패:', err.message);
    console.error('💡 확인 사항:');
    console.error('   1. Heroku 환경변수 MONGODB_URI가 설정되어 있는지 확인');
    console.error('   2. MongoDB Atlas IP 화이트리스트에 0.0.0.0/0 추가 (모든 IP 허용)');
    console.error('   3. MongoDB Atlas 네트워크 액세스 설정 확인');
  });


