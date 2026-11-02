import { The1ApiError } from './the1.interface';

export interface ResilienceOptions {
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly failureThreshold: number;
  readonly cooldownMs: number;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// กลไกควบคุมความทนทานของการเชื่อมต่อ (Timeout, Exponential Backoff Retry สูงสุด 3 ครั้ง และ Circuit Breaker)
export class The1ResiliencePolicy {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAtTimestamp = 0;

  constructor(
    private readonly options: ResilienceOptions = {
      timeoutMs: Number(process.env.THE1_TIMEOUT_MS ?? 5000),
      maxRetries: 3,
      baseDelayMs: 100,
      failureThreshold: 3,
      cooldownMs: 30000,
    },
  ) {}

  // รันฟังก์ชันภายใต้การตรวจสอบ Circuit Breaker, Timeout และการ Retry แบบ Exponential Backoff
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.ensureCircuitAvailable();

    let lastError: unknown;
    const totalAttempts = this.options.maxRetries + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        const result = await this.runWithTimeout(operation, this.options.timeoutMs);
        this.onSuccess();
        return result;
      } catch (err: unknown) {
        lastError = err;
        // กรณี 401 Token หมดอายุ หรือข้อผิดพลาดที่ไม่ควร Retry ให้หยุดทันทีโดยไม่นับเป็นความล้มเหลวของระบบปลายทาง
        if (err instanceof The1ApiError && !err.isRetryable) {
          throw err;
        }

        if (attempt < totalAttempts) {
          const backoffMs = this.options.baseDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(backoffMs);
        }
      }
    }

    this.onFailure();
    throw lastError;
  }

  private ensureCircuitAvailable(): void {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.openedAtTimestamp;
      if (elapsed >= this.options.cooldownMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new The1ApiError(
          'THE1_CIRCUIT_OPEN',
          'ระบบ The 1 API ถูกตัดวงจรชั่วคราวเนื่องจากไม่ตอบสนองเกินเกณฑ์ (Circuit Breaker Open)',
          503,
          false,
        );
      }
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAtTimestamp = Date.now();
    }
  }

  private async runWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new The1ApiError(
            'THE1_REQUEST_TIMEOUT',
            `การเชื่อมต่อระบบ The 1 เกินเวลาที่กำหนด (${timeoutMs} ms)`,
            408,
            true,
          ),
        );
      }, timeoutMs);

      operation()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
