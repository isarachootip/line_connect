-- สร้างตาราง spending_dead_letter สำหรับเก็บรายการยอดใช้จ่ายจากไทวัสดุที่ข้อมูลผิดรูปแบบพร้อมเหตุผล
CREATE TABLE "spending_dead_letter" (
    "id" TEXT NOT NULL,
    "txn_id" TEXT,
    "channel" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spending_dead_letter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spending_dead_letter_channel_created_at_idx" ON "spending_dead_letter"("channel", "created_at");
CREATE INDEX "spending_dead_letter_txn_id_idx" ON "spending_dead_letter"("txn_id");
