import { createServer, Server } from 'net';
import { RedisService } from './redis.service';

// ชุดทดสอบการตรวจสอบสถานะ Redis ผ่านคำสั่ง PING / PONG
describe('RedisService', () => {
  let mockRedisServer: Server;
  let serverPort: number;

  beforeAll((done) => {
    mockRedisServer = createServer((socket) => {
      socket.on('data', (data) => {
        if (data.toString().includes('PING')) {
          socket.write('+PONG\r\n');
        }
      });
    });
    mockRedisServer.listen(0, '127.0.0.1', () => {
      const address = mockRedisServer.address();
      if (address && typeof address === 'object') {
        serverPort = address.port;
      }
      done();
    });
  });

  afterAll((done) => {
    mockRedisServer.close(done);
  });

  it('ควรคืนค่า true เมื่อ Redis ตอบกลับ +PONG', async () => {
    const service = new RedisService('127.0.0.1', serverPort);
    const healthy = await service.checkRedisHealth();
    expect(healthy).toBe(true);
  });

  it('ควรคืนค่า false เมื่อไม่สามารถเชื่อมต่อไปยังพอร์ต Redis ที่ระบุได้', async () => {
    const service = new RedisService('127.0.0.1', 59999, '', 300);
    const healthy = await service.checkRedisHealth();
    expect(healthy).toBe(false);
  });
});
