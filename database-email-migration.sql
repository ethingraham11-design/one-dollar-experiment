-- Run this once in Supabase SQL Editor to enable certificate email tracking.
alter table public.sales
  add column if not exists buyer_email text,
  add column if not exists email_status text not null default 'pending'
    check (email_status in ('pending', 'sending', 'sent', 'failed')),
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text;
