// สัญลักษณ์ Injection Token สำหรับเรียกใช้งาน The1Client ผ่าน NestJS Dependency Injection
export const THE1_CLIENT_TOKEN = Symbol('THE1_CLIENT_TOKEN');

// ข้อมูลผลลัพธ์การยืนยัน OTP จากลูกค้าสำหรับแลก Token ของ The 1
export interface The1OtpResult {
  readonly otpRef: string;
  readonly otpCode: string;
  readonly memberId?: string;
}

// ข้อมูล Token ที่ได้รับจากระบบ The 1 Passport
export interface The1TokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresInSeconds: number;
  readonly expiresAt: Date;
}

// ข้อมูลรายละเอียดสมาชิกเชิงลึกจาก The 1
export interface The1MemberDetail {
  readonly memberId: string;
  readonly cardNumber: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly registeredChannel: string;
  readonly joinedAt: string;
  readonly phone?: string;
  readonly email?: string;
}

// ข้อมูลโปรไฟล์และคะแนนสะสมของสมาชิกจาก The 1
export interface The1Profile {
  readonly memberId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly tier: 'MEMBER' | 'GOLD' | 'PLATINUM';
  readonly points: number;
  readonly phone?: string;
  readonly email?: string;
}

// ประวัติการรับหรือใช้คะแนนสะสม (Point Claim Log)
export interface The1PointClaimLog {
  readonly claimId: string;
  readonly memberId: string;
  readonly points: number;
  readonly type: 'EARN' | 'REDEEM';
  readonly refId: string;
  readonly occurredAt: string;
}

// ผลลัพธ์การเติมคะแนนสะสมเข้าบัญชี The 1 (Earn Point)
export interface The1EarnPointResult {
  readonly transactionId: string;
  readonly memberId: string;
  readonly earnedPoints: number;
  readonly newBalance: number;
  readonly refId: string;
}

// ข้อผิดพลาดมาตรฐานจากการเรียกใช้งาน API ของระบบ The 1
export class The1ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = 'The1ApiError';
  }
}

// อินเทอร์เฟซหลักสำหรับเชื่อมต่อระบบ The 1 Passport ครบทั้ง 8 เมธอดตามสเปก
export interface The1Client {
  getToken(otpResult: The1OtpResult): Promise<The1TokenResponse>;
  refreshToken(refreshToken: string): Promise<The1TokenResponse>;
  getMemberId(token: string): Promise<{ memberId: string }>;
  getMemberDetail(memberId: string): Promise<The1MemberDetail>;
  getProfile(memberId: string): Promise<The1Profile>;
  logout(token: string): Promise<{ success: boolean }>;
  getPointClaimLog(
    memberId: string,
    from: Date,
    to: Date,
  ): Promise<The1PointClaimLog[]>;
  earnPoint(
    memberId: string,
    points: number,
    refId: string,
  ): Promise<The1EarnPointResult>;
}
