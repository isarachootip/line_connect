// การตั้งค่า Playwright สำหรับรัน End-to-End Test บนสภาพแวดล้อม Local และ Staging
export interface PlaywrightStagingConfig {
  readonly testDir: string;
  readonly timeout: number;
  readonly retries: number;
  readonly use: {
    readonly baseURL: string;
    readonly extraHTTPHeaders: Readonly<Record<string, string>>;
    readonly trace: 'on-first-retry' | 'retain-on-failure';
    readonly viewport: { readonly width: number; readonly height: number };
  };
}

const config: PlaywrightStagingConfig = {
  testDir: './',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.STAGING_LIFF_BASE_URL ?? 'http://localhost:5173',
    extraHTTPHeaders: {
      'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
    },
    trace: 'retain-on-failure',
    viewport: { width: 390, height: 844 }, // จำลองขนาดหน้าจอมือถือ LINE LIFF (iPhone 14)
  },
};

export default config;
