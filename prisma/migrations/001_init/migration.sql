-- CreateEnum-style roles are plain text columns (admin | staff), no enum type needed.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(32) NOT NULL, -- admin | staff
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from    TIMESTAMPTZ,
  valid_until   TIMESTAMPTZ,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  closed_at  TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL,
  student_code  VARCHAR(128) NOT NULL, -- MSSV
  scanned_by    UUID NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  UUID,
  cancel_reason VARCHAR(255)
);

-- Partial unique index: one active (non-cancelled) check-in per (session, student_code).
-- Soft-cancelled rows (cancelled_at set) are excluded so the student can be scanned again.
CREATE UNIQUE INDEX checkins_session_student_active_idx
  ON checkins(session_id, student_code)
  WHERE cancelled_at IS NULL;

CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID,
  action     VARCHAR(255) NOT NULL,
  target_id  UUID,
  ip         VARCHAR(64),
  request_id VARCHAR(255),
  metadata   JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
