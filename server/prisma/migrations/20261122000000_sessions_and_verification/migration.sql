ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "verify_token_hash" TEXT, ADD COLUMN "verify_expires_at" TIMESTAMP(3);
CREATE TABLE "sessions" (
  "token_hash" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
