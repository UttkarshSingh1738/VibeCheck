-- Run this in the Supabase SQL editor (Project → SQL → New query → paste → Run).

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  spotify_id text unique not null,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid references users(id) not null,
  opponent_user_id uuid references users(id),
  host_playlist_id text not null,
  opponent_playlist_id text,
  status text not null default 'waiting',  -- waiting | scoring | voting | done | failed
  vote_closes_at timestamptz,
  winner text,                             -- 'host' | 'opponent' | null
  created_at timestamptz default now()
);

create table if not exists scorecards (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid references battles(id) on delete cascade not null,
  side text not null,                      -- 'host' | 'opponent'
  cohesion int not null,
  diversity int not null,
  discovery int not null,
  vibe int not null,
  lyrical_depth int not null,
  commentary text,
  raw_response jsonb,
  created_at timestamptz default now(),
  unique(battle_id, side)
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid references battles(id) on delete cascade not null,
  voter_fingerprint text not null,
  choice text not null,                    -- 'host' | 'opponent'
  created_at timestamptz default now(),
  unique(battle_id, voter_fingerprint)
);

create table if not exists analytics_events (
  id bigserial primary key,
  event_name text not null,
  battle_id uuid references battles(id) on delete cascade,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_battles_host on battles(host_user_id);
create index if not exists idx_battles_status on battles(status);
create index if not exists idx_votes_battle on votes(battle_id);

-- RLS intentionally disabled for the MVP. All writes go through server routes
-- that use the service-role key. See DECISIONS.md.
