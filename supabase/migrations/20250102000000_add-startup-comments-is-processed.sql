-- Add is_processed flag to startup_comments for AI analysis tracking
alter table startup_comments add column if not exists is_processed boolean not null default false;
create index if not exists idx_startup_comments_unprocessed on startup_comments(created_at) where is_processed = false;
