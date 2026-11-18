-- Candidate Evidence Vault. Run after 001_fairmatch_mvp.sql.
-- Files are optional and private; sensitive evidence is never used for ATS scoring.
CREATE TABLE IF NOT EXISTS candidate_evidence (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind ENUM('resume','portfolio','certificate','employment','achievement','offer_letter','project','other') NOT NULL,
  title VARCHAR(180) NOT NULL,
  issuer VARCHAR(160) NULL,
  issued_on DATE NULL,
  expires_on DATE NULL,
  verification_url VARCHAR(2048) NULL,
  portfolio_url VARCHAR(2048) NULL,
  skills JSON NULL,
  notes VARCHAR(1000) NULL,
  file_name VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  file_size_bytes INT UNSIGNED NULL,
  file_content LONGBLOB NULL,
  verification_status ENUM('self_attested','pending','verified','rejected') NOT NULL DEFAULT 'self_attested',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT candidate_evidence_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX candidate_evidence_user_idx (user_id, created_at),
  INDEX candidate_evidence_expiry_idx (user_id, expires_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
