// สคริปต์ทดสอบประสิทธิภาพ (Load Test) ด้วย k6 สำหรับ POST /auth/line และ GET /me/home
// วิธีรัน: k6 run -e BASE_URL=https://staging-api.lineconnect.internal -e K6_VUS=200 tests/load/k6-auth-and-home.js
import http from 'k6/http';
import { check, sleep } from 'k6';

// จำนวนผู้ใช้พร้อมกันที่ทีม Marketing คาดการณ์ช่วง Broadcast แคมเปญผ่าน LINE OA (ค่าเริ่มต้น 200 VUs)
const TARGET_CONCURRENT_USERS = Number(__ENV.K6_VUS || 200);
const BASE_URL = __ENV.BASE_URL || __ENV.STAGING_API_BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    line_oa_campaign_spike: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: TARGET_CONCURRENT_USERS },
        { duration: '1m', target: TARGET_CONCURRENT_USERS },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // เกณฑ์มาตรฐาน SLA: เวลาตอบสนองที่ Percentile 95 ต้องน้อยกว่า 500 มิลลิวินาที (p95 < 500 ms)
    http_req_duration: ['p(95)<500'],
    'http_req_duration{endpoint:auth_line}': ['p(95)<500'],
    'http_req_duration{endpoint:me_home}': ['p(95)<500'],
    // อัตราการเกิดข้อผิดพลาดต้องต่ำกว่า 1%
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // 1. ทดสอบ POST /auth/line (ตรวจสอบสถานะการผูกบัญชีของสมาชิกเมื่อเปิด LIFF จาก Rich Menu)
  const authPayload = JSON.stringify({
    idToken: 'mock-id-token:U_DEV_001',
    brand: 'TWD',
  });
  const authRes = http.post(`${BASE_URL}/auth/line`, authPayload, {
    headers,
    tags: { endpoint: 'auth_line' },
  });

  const isAuthOk = check(authRes, {
    'POST /auth/line status is 200': (r) => r.status === 200,
    'POST /auth/line returns linked status': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.linked === 'boolean';
      } catch {
        return false;
      }
    },
  });

  // 2. ทดสอบ GET /me/home (ดึงข้อมูลหน้าหลัก: การ์ดสมาชิก, แต้ม TWD/BnB, คูปอง 5 ใบล่าสุด และ Mission)
  if (isAuthOk) {
    let accessToken = '';
    try {
      const parsed = JSON.parse(authRes.body);
      accessToken = parsed.accessToken || '';
    } catch {
      accessToken = '';
    }

    if (accessToken) {
      const homeRes = http.get(`${BASE_URL}/me/home?brand=TWD`, {
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        tags: { endpoint: 'me_home' },
      });

      check(homeRes, {
        'GET /me/home status is 200': (r) => r.status === 200,
        'GET /me/home contains memberId and points': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Boolean(body.memberId && body.points);
          } catch {
            return false;
          }
        },
      });
    }
  }

  sleep(1);
}
