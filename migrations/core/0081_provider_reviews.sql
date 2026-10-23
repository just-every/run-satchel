-- OSS-001: the principal's recorded review of a provider's own terms and direct firm billing before Satchel connects it.
CREATE TABLE s_provider_reviews(id TEXT PRIMARY KEY,provider_id TEXT NOT NULL,terms_url TEXT NOT NULL,disclosure_version INTEGER NOT NULL,reviewed_by TEXT NOT NULL,reviewed_at TEXT NOT NULL);
CREATE INDEX s_provider_reviews_provider ON s_provider_reviews(provider_id,reviewed_at);
