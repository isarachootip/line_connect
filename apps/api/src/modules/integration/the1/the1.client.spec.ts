import { AuditLogRepository } from '../../audit/repositories/audit-log.repository';
import { The1MockClient } from './the1-mock.client';
import { The1HttpClient } from './the1-http.client';
import { ResilientThe1Client } from './resilient-the1.client';
import { The1ResiliencePolicy } from './the1-resilience';
import { The1ApiError } from './the1.interface';

// ชุดทดสอบสำหรับโมดูล integration/the1 (Mock 3 สมาชิก, 401 Token หมดอายุ, Timeout, Retry 3x, Circuit Breaker และ Audit Log)
describe('The1Client Integration Module (Mock, Resilience & Audit Log)', () => {
  let capturedAudits: Array<{
    actor: string;
    action: string;
    target: string;
    metadata: Record<string, unknown>;
  }>;
  let auditRepoMock: AuditLogRepository;

  beforeEach(() => {
    capturedAudits = [];
    auditRepoMock = {
      recordAudit: jest.fn().mockImplementation(
        (input: {
          actor: string;
          action: string;
          target: string;
          metadata: Record<string, unknown>;
        }) => {
          capturedAudits.push(input);
          return Promise.resolve({ id: `audit-${capturedAudits.length}`, ...input });
        },
      ),
    } as unknown as AuditLogRepository;
  });

  it('กรณีสำเร็จ: ควรดึงข้อมูลสมาชิกตัวอย่างทั้ง 3 คน และทำงานครบทั้ง 8 เมธอด พร้อมบันทึก audit_log โดยไม่มี PII/Token', async () => {
    const mockBackend = new The1MockClient();
    const resilience = new The1ResiliencePolicy({
      timeoutMs: 1000,
      maxRetries: 3,
      baseDelayMs: 5,
      failureThreshold: 3,
      cooldownMs: 5000,
    });
    const client = new ResilientThe1Client(mockBackend, resilience, auditRepoMock);

    // 1. getToken จากผลลัพธ์ OTP ของสมาชิกคนที่ 1
    const tokenRes = await client.getToken({
      otpRef: 'REF-001',
      otpCode: '123456',
      memberId: 'T1_MEM_001',
    });
    expect(tokenRes.accessToken).toBeDefined();
    expect(tokenRes.refreshToken).toBeDefined();

    // 2. getMemberId จาก access token
    const memberIdRes = await client.getMemberId(tokenRes.accessToken);
    expect(memberIdRes.memberId).toBe('T1_MEM_001');

    // 3. getMemberDetail และ 4. getProfile ของสมาชิกตัวอย่างทั้ง 3 คน
    const detail1 = await client.getMemberDetail('T1_MEM_001');
    const detail2 = await client.getMemberDetail('T1_MEM_002');
    const detail3 = await client.getMemberDetail('T1_MEM_003');
    expect(detail1.memberId).toBe('T1_MEM_001');
    expect(detail2.memberId).toBe('T1_MEM_002');
    expect(detail3.memberId).toBe('T1_MEM_003');

    const profile1 = await client.getProfile('T1_MEM_001');
    expect(profile1.points).toBeGreaterThan(0);

    // 5. earnPoint และ 6. getPointClaimLog
    const earnRes = await client.earnPoint('T1_MEM_001', 250, 'MISSION-REF-100');
    expect(earnRes.earnedPoints).toBe(250);
    expect(earnRes.newBalance).toBe(profile1.points + 250);

    const logs = await client.getPointClaimLog(
      'T1_MEM_001',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-12-31T23:59:59Z'),
    );
    expect(logs.length).toBeGreaterThanOrEqual(1);

    // 7. refreshToken และ 8. logout
    const refreshed = await client.refreshToken(tokenRes.refreshToken);
    expect(refreshed.accessToken).not.toBe(tokenRes.accessToken);

    const logoutRes = await client.logout(refreshed.accessToken);
    expect(logoutRes.success).toBe(true);

    // ตรวจสอบว่าทุก Request บันทึก audit_log และไม่มี Token หรือข้อมูลส่วนบุคคลรั่วไหล
    expect(capturedAudits).toHaveLength(10);
    const serializedAudits = JSON.stringify(capturedAudits);
    expect(serializedAudits).not.toContain(tokenRes.accessToken);
    expect(serializedAudits).not.toContain(tokenRes.refreshToken);
    expect(serializedAudits).not.toContain(profile1.firstName);
    expect(serializedAudits).not.toContain(profile1.lastName);
  });

  it('กรณี 401 Token หมดอายุ: ควรโยนข้อผิดพลาด 401 TOKEN_EXPIRED ทันทีโดยไม่ Retry และบันทึก audit_log สถานะล้มเหลว', async () => {
    const mockBackend = new The1MockClient();
    const resilience = new The1ResiliencePolicy({
      timeoutMs: 500,
      maxRetries: 3,
      baseDelayMs: 5,
      failureThreshold: 3,
      cooldownMs: 5000,
    });
    const client = new ResilientThe1Client(mockBackend, resilience, auditRepoMock);

    await expect(client.getMemberId('expired-token-sample')).rejects.toMatchObject({
      statusCode: 401,
      code: 'THE1_TOKEN_EXPIRED',
    });

    expect(capturedAudits).toHaveLength(1);
    expect(capturedAudits[0].metadata.status).toBe('error');
    expect(capturedAudits[0].metadata.statusCode).toBe(401);
    expect(JSON.stringify(capturedAudits[0])).not.toContain('expired-token-sample');
  });

  it('กรณี Timeout, Exponential Backoff Retry สูงสุด 3 ครั้ง และ Circuit Breaker: ควร Retry เมื่อเกิด Timeout และเปิดวงจรเมื่อล้มเหลวครบเกณฑ์', async () => {
    let invocationCount = 0;
    const slowHttpClient = new The1HttpClient(
      {
        baseUrl: 'https://api-mock.the1.co.th',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      async () => {
        invocationCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 80));
        throw new The1ApiError('THE1_UPSTREAM_ERROR', 'Upstream timeout', 503, true);
      },
    );

    const resilience = new The1ResiliencePolicy({
      timeoutMs: 25,
      maxRetries: 3,
      baseDelayMs: 5,
      failureThreshold: 2,
      cooldownMs: 10000,
    });
    const client = new ResilientThe1Client(slowHttpClient, resilience, auditRepoMock);

    // คำขอที่ 1: พยายามครั้งแรก 1 ครั้ง + Retry ซ้ำ 3 ครั้ง = เรียกทั้งหมด 4 ครั้ง แล้วโยน Timeout (408)
    await expect(client.getProfile('T1_MEM_001')).rejects.toMatchObject({
      statusCode: 408,
      code: 'THE1_REQUEST_TIMEOUT',
    });
    expect(invocationCount).toBe(4);

    // คำขอที่ 2: ล้มเหลวซ้ำเป็นครั้งที่ 2 ทำให้ Circuit Breaker เปิดวงจร (failureThreshold = 2)
    await expect(client.getProfile('T1_MEM_001')).rejects.toMatchObject({
      statusCode: 408,
      code: 'THE1_REQUEST_TIMEOUT',
    });
    expect(invocationCount).toBe(8);

    // คำขอที่ 3: Circuit Breaker เปิดแล้ว ต้องปฏิเสธทันที (503 THE1_CIRCUIT_OPEN) โดยไม่เรียกฟังก์ชันปลายทางเพิ่ม
    await expect(client.getProfile('T1_MEM_001')).rejects.toMatchObject({
      statusCode: 503,
      code: 'THE1_CIRCUIT_OPEN',
    });
    expect(invocationCount).toBe(8);
  });
});
