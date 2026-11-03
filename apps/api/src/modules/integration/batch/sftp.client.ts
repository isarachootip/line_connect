import { Injectable } from '@nestjs/common';
import * as fs from 'fs';

export const SFTP_CLIENT_TOKEN = Symbol('SFTP_CLIENT_TOKEN');

export interface SftpConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly privateKeyPath: string;
  readonly remoteDir: string;
}

export interface SftpUploadRequest {
  readonly localFilePath: string;
  readonly remoteFileName: string;
  readonly encryptedContent: string;
}

export interface SftpUploadResult {
  readonly host: string;
  readonly remotePath: string;
  readonly bytesTransferred: number;
  readonly uploadedAt: Date;
}

// อินเทอร์เฟซสำหรับการส่งไฟล์ Batch กลุ่มเป้าหมายที่เข้ารหัสแล้วผ่าน SFTP ไปยังไทวัสดุ
export interface SftpClient {
  uploadEncryptedBatchFile(request: SftpUploadRequest): Promise<SftpUploadResult>;
}

// Mock SFTP Client สำหรับใช้ในการพัฒนาและชุดทดสอบ (Test ด้วย SFTP Mock)
@Injectable()
export class SftpMockClient implements SftpClient {
  private readonly uploadedFiles: Array<SftpUploadRequest & SftpUploadResult> = [];
  private readonly config: SftpConnectionConfig;

  constructor(config?: Partial<SftpConnectionConfig>) {
    this.config = {
      host: config?.host ?? process.env.SFTP_HOST ?? 'sftp-mock.thaiwatsadu.com',
      port: config?.port ?? Number(process.env.SFTP_PORT ?? 22),
      username: config?.username ?? process.env.SFTP_USER ?? 'twd_batch_user',
      privateKeyPath:
        config?.privateKeyPath ??
        process.env.SFTP_KEY_PATH ??
        './secrets/id_ed25519_twd_sftp',
      remoteDir:
        config?.remoteDir ??
        process.env.SFTP_REMOTE_DIR ??
        '/incoming/target-batches',
    };
  }

  async uploadEncryptedBatchFile(
    request: SftpUploadRequest,
  ): Promise<SftpUploadResult> {
    const cleanDir = this.config.remoteDir.replace(/\/+$/, '');
    const remotePath = `${cleanDir}/${request.remoteFileName}`;
    const bytesTransferred = Buffer.byteLength(request.encryptedContent, 'utf8');
    const uploadedAt = new Date();
    const result: SftpUploadResult = {
      host: this.config.host,
      remotePath,
      bytesTransferred,
      uploadedAt,
    };
    this.uploadedFiles.push({ ...request, ...result });
    return result;
  }

  // ดึงรายการไฟล์ที่ถูกอัปโหลดผ่าน SFTP Mock สำหรับตรวจสอบใน Unit / Integration Test
  getUploadedFiles(): ReadonlyArray<SftpUploadRequest & SftpUploadResult> {
    return [...this.uploadedFiles];
  }

  // ดึงการตั้งค่า SFTP ปัจจุบัน (host, user, keyPath)
  getConnectionConfig(): SftpConnectionConfig {
    return this.config;
  }

  // ล้างประวัติการอัปโหลดสำหรับการทดสอบ
  clearUploadedFiles(): void {
    this.uploadedFiles.length = 0;
  }
}

// SFTP Transport Client สำหรับสภาพแวดล้อมจริง (ตรวจสอบ SFTP_HOST, SFTP_USER, SFTP_KEY_PATH)
export class SftpTransportClient implements SftpClient {
  constructor(private readonly config: SftpConnectionConfig) {}

  async uploadEncryptedBatchFile(
    request: SftpUploadRequest,
  ): Promise<SftpUploadResult> {
    if (!this.config.host || !this.config.username || !this.config.privateKeyPath) {
      throw new Error(
        'ต้องกำหนดค่า SFTP_HOST, SFTP_USER และ SFTP_KEY_PATH ให้ครบถ้วนสำหรับเชื่อมต่อ SFTP',
      );
    }
    if (!fs.existsSync(this.config.privateKeyPath)) {
      throw new Error(
        `ไม่พบไฟล์ Private Key สำหรับ SFTP ที่พาธ: ${this.config.privateKeyPath}`,
      );
    }

    // TODO: เชื่อมต่อ SSH/SFTP Transport จริงด้วย Private Key เมื่อทีม Infrastructure ของไทวัสดุเปิด Firewall SFTP ปลายทาง
    const cleanDir = this.config.remoteDir.replace(/\/+$/, '');
    return {
      host: this.config.host,
      remotePath: `${cleanDir}/${request.remoteFileName}`,
      bytesTransferred: Buffer.byteLength(request.encryptedContent, 'utf8'),
      uploadedAt: new Date(),
    };
  }
}
