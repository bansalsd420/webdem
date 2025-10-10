-- Migration: create app_home_broadcasts
DROP TABLE IF EXISTS `app_home_broadcasts`;
CREATE TABLE `app_home_broadcasts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `business_id` int NOT NULL DEFAULT 0,
  `title` varchar(255) DEFAULT NULL,
  `body` text,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `business_id_idx` (`business_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
