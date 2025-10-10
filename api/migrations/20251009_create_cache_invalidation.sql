-- Migration: create cache_invalidation table
-- Run this in your MySQL database used by the API

CREATE TABLE IF NOT EXISTS cache_invalidation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  cache_key VARCHAR(255) NOT NULL,
  resource VARCHAR(64) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed TINYINT(1) DEFAULT 0,
  INDEX (processed),
  INDEX (created_at)
);
