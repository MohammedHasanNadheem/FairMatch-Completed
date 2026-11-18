-- FairMatch MVP: MySQL 8.0+ schema. All timestamps are UTC.
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role ENUM('school_student','college_student','job_seeker','college_coordinator','college_admin','company_hr','company_admin','platform_admin') NOT NULL,
  account_status ENUM('active','pending_approval','suspended') NOT NULL DEFAULT 'active',
  requested_organisation_name VARCHAR(160) NULL,
  email_verified_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX users_role_status_idx (role, account_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT refresh_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX refresh_sessions_user_idx (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS organisations (
  id CHAR(36) PRIMARY KEY,
  kind ENUM('college','company') NOT NULL,
  legal_name VARCHAR(160) NOT NULL,
  verification_status ENUM('pending','verified','rejected','suspended') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX organisations_kind_status_idx (kind, verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS organisation_memberships (
  organisation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  membership_role ENUM('college_coordinator','college_admin','company_hr','company_admin') NOT NULL,
  status ENUM('pending','active','revoked') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organisation_id, user_id),
  CONSTRAINT membership_org_fk FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT membership_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS profiles (
  user_id CHAR(36) PRIMARY KEY,
  headline VARCHAR(180) NULL,
  location VARCHAR(120) NULL,
  stage ENUM('school','college','experienced') NULL,
  skills JSON NULL,
  preferences JSON NULL,
  visibility ENUM('private','application_only','discoverable') NOT NULL DEFAULT 'private',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT profiles_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Private candidate evidence. Files are optional and never automatically affect ATS scoring.
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

CREATE TABLE IF NOT EXISTS opportunities (
  id CHAR(36) PRIMARY KEY,
  organisation_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL,
  type ENUM('internship','placement','job') NOT NULL,
  location VARCHAR(120) NULL,
  work_mode ENUM('onsite','hybrid','remote') NOT NULL DEFAULT 'onsite',
  description TEXT NOT NULL,
  requirements JSON NULL,
  status ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT opportunities_org_fk FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  INDEX opportunities_listing_idx (status, type, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) PRIMARY KEY,
  opportunity_id CHAR(36) NOT NULL,
  candidate_id CHAR(36) NOT NULL,
  cover_note TEXT NULL,
  status ENUM('submitted','shortlisted','interview','offer','rejected','withdrawn') NOT NULL DEFAULT 'submitted',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT applications_opportunity_fk FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  CONSTRAINT applications_candidate_fk FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY applications_once_idx (opportunity_id, candidate_id),
  INDEX applications_candidate_idx (candidate_id, status),
  INDEX applications_opportunity_idx (opportunity_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NULL,
  organisation_id CHAR(36) NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX audit_actor_idx (actor_id, created_at),
  INDEX audit_org_idx (organisation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
