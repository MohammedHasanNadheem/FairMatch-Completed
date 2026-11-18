-- FairMatch Phase 2-4 completion: notifications, college cohorts & drives, privacy requests, and offer responses.
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body VARCHAR(500) NOT NULL,
  category ENUM('application','approval','organisation','system') NOT NULL DEFAULT 'system',
  entity_type VARCHAR(80) NULL,
  entity_id CHAR(36) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX notifications_user_idx (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS college_cohorts (
  id CHAR(36) PRIMARY KEY,
  organisation_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  department VARCHAR(120) NULL,
  graduation_year SMALLINT UNSIGNED NOT NULL,
  eligibility_notes VARCHAR(500) NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cohorts_org_fk FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  INDEX cohorts_org_idx (organisation_id, status, graduation_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS placement_drives (
  id CHAR(36) PRIMARY KEY,
  organisation_id CHAR(36) NOT NULL,
  cohort_id CHAR(36) NULL,
  title VARCHAR(180) NOT NULL,
  employer_name VARCHAR(160) NOT NULL,
  drive_date DATE NULL,
  status ENUM('planned','open','completed','cancelled') NOT NULL DEFAULT 'planned',
  notes VARCHAR(1000) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT drives_org_fk FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT drives_cohort_fk FOREIGN KEY (cohort_id) REFERENCES college_cohorts(id) ON DELETE SET NULL,
  INDEX drives_org_idx (organisation_id, status, drive_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  request_type ENUM('export','deletion') NOT NULL,
  status ENUM('pending','in_review','completed','cancelled') NOT NULL DEFAULT 'pending',
  notes VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT privacy_requests_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX privacy_requests_user_idx (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
