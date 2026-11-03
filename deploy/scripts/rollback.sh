#!/usr/bin/env sh
# สคริปต์สำหรับย้อนกลับ (Rollback) การ Deploy ระบบ Line Connect ด้วยคำสั่งเดียว
# วิธีใช้งานคำสั่งเดียว: npm run deploy:rollback (หรือ sh deploy/scripts/rollback.sh prod)

set -e

TARGET_ENV="${1:-prod}"
NAMESPACE="line-connect-${TARGET_ENV}"
DEPLOYMENT_NAME="line-connect-api"

echo "[Rollback] กำลังย้อนกลับ Deployment '${DEPLOYMENT_NAME}' ใน Namespace '${NAMESPACE}'..."

if command -v kubectl >/dev/null 2>&1; then
  kubectl rollout undo "deployment/${DEPLOYMENT_NAME}" -n "${NAMESPACE}"
  kubectl rollout status "deployment/${DEPLOYMENT_NAME}" -n "${NAMESPACE}" --timeout=120s
  echo "[Rollback] ย้อนกลับไปยัง Revision ก่อนหน้าสำเร็จเรียบร้อย"
else
  echo "[Rollback Dry-Run] kubectl rollout undo deployment/${DEPLOYMENT_NAME} -n ${NAMESPACE}"
fi
