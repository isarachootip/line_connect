-- Migration เริ่มต้นสำหรับระบบ Line Connect (ครบทั้ง 11 ตาราง, Constraints และ Indexes)

CREATE TYPE "Brand" AS ENUM ('TWD', 'BNB');
CREATE TYPE "LineLinkStatus" AS ENUM ('active', 'unlinked');
CREATE TYPE "ConsentType" AS ENUM ('TNC', 'PDPA', 'MARKETING');
CREATE TYPE "CouponSource" AS ENUM ('TWD', 'THE1');
CREATE TYPE "CouponWalletStatus" AS ENUM ('available', 'used', 'expired');

-- 1. ตาราง line_link
CREATE TABLE "line_link" (
    "id" TEXT NOT NULL,
    "line_uid" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LineLinkStatus" NOT NULL DEFAULT 'active',
    CONSTRAINT "line_link_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "line_link_line_uid_brand_key" ON "line_link"("line_uid", "brand");
CREATE INDEX "line_link_member_id_idx" ON "line_link"("member_id");
CREATE INDEX "line_link_status_idx" ON "line_link"("status");

-- 2. ตาราง consent (Append-only: ห้าม update ทับ)
CREATE TABLE "consent" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consent_member_id_type_version_idx" ON "consent"("member_id", "type", "version");
CREATE INDEX "consent_member_id_granted_at_idx" ON "consent"("member_id", "granted_at");

-- 3. ตาราง the1_token (เข้ารหัสระดับ column)
CREATE TABLE "the1_token" (
    "member_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "the1_token_pkey" PRIMARY KEY ("member_id")
);
CREATE INDEX "the1_token_expires_at_idx" ON "the1_token"("expires_at");

-- 4. ตาราง member_profile (แคชจาก The 1)
CREATE TABLE "member_profile" (
    "member_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_profile_pkey" PRIMARY KEY ("member_id")
);
CREATE INDEX "member_profile_tier_idx" ON "member_profile"("tier");
CREATE INDEX "member_profile_refreshed_at_idx" ON "member_profile"("refreshed_at");

-- 5. ตาราง spending_txn
CREATE TABLE "spending_txn" (
    "txn_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "txn_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spending_txn_pkey" PRIMARY KEY ("txn_id")
);
CREATE UNIQUE INDEX "spending_txn_txn_id_key" ON "spending_txn"("txn_id");
CREATE INDEX "spending_txn_member_id_txn_at_idx" ON "spending_txn"("member_id", "txn_at");
CREATE INDEX "spending_txn_store_idx" ON "spending_txn"("store");
CREATE INDEX "spending_txn_category_idx" ON "spending_txn"("category");

-- 6. ตาราง mission
CREATE TABLE "mission" (
    "mission_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule" JSONB NOT NULL,
    "target" DECIMAL(12,2) NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "reward" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "mission_pkey" PRIMARY KEY ("mission_id")
);
CREATE INDEX "mission_status_start_at_end_at_idx" ON "mission"("status", "start_at", "end_at");

-- 7. ตาราง mission_progress
CREATE TABLE "mission_progress" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "progress" DECIMAL(12,2) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mission_progress_member_id_mission_id_key" ON "mission_progress"("member_id", "mission_id");
CREATE INDEX "mission_progress_mission_id_idx" ON "mission_progress"("mission_id");
CREATE INDEX "mission_progress_member_id_idx" ON "mission_progress"("member_id");
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_mission_id_fkey"
    FOREIGN KEY ("mission_id") REFERENCES "mission"("mission_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. ตาราง coupon
CREATE TABLE "coupon" (
    "coupon_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" "CouponSource" NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "max_discount" DECIMAL(12,2),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupon_pkey" PRIMARY KEY ("coupon_id")
);
CREATE UNIQUE INDEX "coupon_code_key" ON "coupon"("code");
CREATE INDEX "coupon_source_valid_from_valid_to_idx" ON "coupon"("source", "valid_from", "valid_to");

-- 9. ตาราง coupon_wallet
CREATE TABLE "coupon_wallet" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "status" "CouponWalletStatus" NOT NULL DEFAULT 'available',
    "used_at" TIMESTAMP(3),
    CONSTRAINT "coupon_wallet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "coupon_wallet_member_id_status_idx" ON "coupon_wallet"("member_id", "status");
CREATE INDEX "coupon_wallet_coupon_id_idx" ON "coupon_wallet"("coupon_id");
ALTER TABLE "coupon_wallet" ADD CONSTRAINT "coupon_wallet_coupon_id_fkey"
    FOREIGN KEY ("coupon_id") REFERENCES "coupon"("coupon_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 10. ตาราง target_batch
CREATE TABLE "target_batch" (
    "batch_id" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3),
    CONSTRAINT "target_batch_pkey" PRIMARY KEY ("batch_id")
);
CREATE INDEX "target_batch_segment_sent_at_idx" ON "target_batch"("segment", "sent_at");

-- 11. ตาราง audit_log
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_log_actor_created_at_idx" ON "audit_log"("actor", "created_at");
CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log"("action", "created_at");
