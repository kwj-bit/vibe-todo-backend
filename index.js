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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// routes
app.use('/todos', require('./routes/todos'));

const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/todo';

if (!process.env.MONGODB_URI) {
  console.warn('⚠️  경고: 환경변수 MONGODB_URI가 설정되지 않았습니다. 기본값을 사용합니다.');
} else {
  console.log('✅ 환경변수에서 MongoDB URI를 사용합니다.');
}

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log('MongoDB 연결 성공');
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
  })
  .catch((err) => {
    console.error('MongoDB 연결 실패:', err.message);
    process.exit(1);
  });


