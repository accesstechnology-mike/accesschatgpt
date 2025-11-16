-- Users table (must be created first for foreign key reference)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'free',
  subscription_tier TEXT DEFAULT 'free'
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  daily_usage_count INTEGER DEFAULT 0,
  daily_usage_reset_at INTEGER NOT NULL,
  is_blocked INTEGER DEFAULT 0,
  blocked_until INTEGER,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Usage logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  suspicious INTEGER DEFAULT 0
);

-- Rate limiting table (persistent across server restarts)
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL, -- IP address or session ID
  endpoint TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  reset_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(identifier, endpoint)
);

-- Request fingerprints for bot detection
CREATE TABLE IF NOT EXISTS request_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  session_id TEXT,
  user_agent TEXT,
  accept_language TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  request_count INTEGER DEFAULT 1,
  UNIQUE(fingerprint)
);

-- Cost tracking table
CREATE TABLE IF NOT EXISTS cost_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  total_cost REAL DEFAULT 0.0,
  request_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_reset_at ON sessions(daily_usage_reset_at);
CREATE INDEX IF NOT EXISTS idx_sessions_blocked ON sessions(is_blocked, blocked_until);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_session ON usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_logs_suspicious ON usage_logs(suspicious);
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS idx_fingerprints_fingerprint ON request_fingerprints(fingerprint);
CREATE INDEX IF NOT EXISTS idx_fingerprints_ip ON request_fingerprints(ip_address);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_date ON cost_tracking(date);

