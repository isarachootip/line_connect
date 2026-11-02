import { Inject, Injectable } from '@nestjs/common';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { RedisService } from '../../../common/redis/redis.service';
import {
  THE1_CLIENT_TOKEN,
  The1Client,
} from '../../integration/the1/the1.interface';
import { MemberProfileRepository } from '../repositories/member-profile.repository';

export interface CachedProfileSnapshot {
  readonly memberId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly tier: string;
  readonly points: number;
  readonly phone?: string;
  readonly email?: string;
  readonly refreshedAt: string;
}

export interface ProfileWithCacheState {
  readonly profile: CachedProfileSnapshot;
  readonly stale: boolean;
  readonly refreshedAt: string;
}

// บริการแคชข้อมูล member_profile ใน Redis เป็นเวลา 10 นาที (600 วินาที) พร้อมทำ Stale Fallback เมื่อระบบ The 1 ล่ม
@Injectable()
export class MemberProfileCacheService {
  private static readonly FRESH_KEY_PREFIX = 'member_profile:fresh:';
  private static readonly BACKUP_KEY_PREFIX = 'member_profile:backup:';
  private static readonly BACKUP_TTL_SECONDS = 7 * 24 * 60 * 60;
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly encryptionService: EncryptionService,
    private readonly memberProfileRepo: MemberProfileRepository,
    @Inject(THE1_CLIENT_TOKEN)
    private readonly the1Client: The1Client,
    ttlSeconds = Number(process.env.MEMBER_PROFILE_CACHE_TTL_SECONDS ?? 600),
  ) {
    this.ttlSeconds = ttlSeconds;
  }

  // ดึงโปรไฟล์สมาชิกจาก Redis Cache (10 นาที) หากหมดอายุจะดึงจาก The 1 และถ้า The 1 ล่มจะคืนค่าแคชพร้อม stale=true
  async getProfileWithFallback(
    memberId: string,
    now = new Date(),
  ): Promise<ProfileWithCacheState> {
    const nowMs = now.getTime();
    const freshKey = `${MemberProfileCacheService.FRESH_KEY_PREFIX}${memberId}`;
    const backupKey = `${MemberProfileCacheService.BACKUP_KEY_PREFIX}${memberId}`;

    const cachedEncrypted = await this.redisService.getCache(freshKey, nowMs);
    if (cachedEncrypted) {
      const snapshot = this.deserializeEncrypted(cachedEncrypted);
      return {
        profile: snapshot,
        stale: false,
        refreshedAt: snapshot.refreshedAt,
      };
    }

    try {
      const liveProfile = await this.the1Client.getProfile(memberId);
      const refreshedAtIso = now.toISOString();
      const snapshot: CachedProfileSnapshot = {
        memberId: liveProfile.memberId,
        firstName: liveProfile.firstName,
        lastName: liveProfile.lastName,
        tier: liveProfile.tier,
        points: liveProfile.points,
        phone: liveProfile.phone,
        email: liveProfile.email,
        refreshedAt: refreshedAtIso,
      };

      await this.memberProfileRepo.upsertProfile({
        memberId: snapshot.memberId,
        firstName: snapshot.firstName,
        lastName: snapshot.lastName,
        tier: snapshot.tier,
        points: snapshot.points,
        refreshedAt: now,
      });

      const encryptedPayload = this.serializeEncrypted(snapshot);
      await this.redisService.setCache(
        freshKey,
        encryptedPayload,
        this.ttlSeconds,
        nowMs,
      );
      await this.redisService.setCache(
        backupKey,
        encryptedPayload,
        MemberProfileCacheService.BACKUP_TTL_SECONDS,
        nowMs,
      );

      return {
        profile: snapshot,
        stale: false,
        refreshedAt: refreshedAtIso,
      };
    } catch (upstreamError: unknown) {
      const backupEncrypted = await this.redisService.getCache(
        backupKey,
        nowMs,
      );
      if (backupEncrypted) {
        const snapshot = this.deserializeEncrypted(backupEncrypted);
        return {
          profile: snapshot,
          stale: true,
          refreshedAt: snapshot.refreshedAt,
        };
      }

      const dbCached = await this.memberProfileRepo.findByMemberId(memberId);
      if (dbCached) {
        const refreshedAtIso = (dbCached.refreshedAt ?? now).toISOString();
        return {
          profile: {
            memberId: dbCached.memberId,
            firstName: dbCached.firstName,
            lastName: dbCached.lastName,
            tier: dbCached.tier,
            points: dbCached.points,
            refreshedAt: refreshedAtIso,
          },
          stale: true,
          refreshedAt: refreshedAtIso,
        };
      }

      throw upstreamError;
    }
  }

  private serializeEncrypted(snapshot: CachedProfileSnapshot): string {
    return this.encryptionService.encrypt(JSON.stringify(snapshot));
  }

  private deserializeEncrypted(encryptedPayload: string): CachedProfileSnapshot {
    const json = this.encryptionService.decrypt(encryptedPayload);
    return JSON.parse(json) as CachedProfileSnapshot;
  }
}
