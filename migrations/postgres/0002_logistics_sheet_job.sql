CREATE TABLE scm_sheet_jobs (
  job_key TEXT PRIMARY KEY,
  generation INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),
  lease_token TEXT,
  lease_until BIGINT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
-- Initial backfill queues existing source data without changing any business records.
INSERT INTO scm_sheet_jobs(job_key,generation,state,updated_at)
SELECT 'logistics',1,'pending',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE EXISTS(SELECT 1 FROM scm_records) OR EXISTS(SELECT 1 FROM scm_finance);
