CREATE TABLE `api_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`token` varchar(128) NOT NULL,
	`createdBy` int NOT NULL,
	`status` enum('active','revoked') NOT NULL DEFAULT 'active',
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `forbidden_words` (
	`id` int AUTO_INCREMENT NOT NULL,
	`word` varchar(255) NOT NULL,
	`category` varchar(64) DEFAULT 'general',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `forbidden_words_id` PRIMARY KEY(`id`),
	CONSTRAINT `forbidden_words_word_unique` UNIQUE(`word`)
);
--> statement-breakpoint
CREATE TABLE `llm_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`apiKey` varchar(512) NOT NULL,
	`model` varchar(128) NOT NULL,
	`prompt` text,
	`temperature` varchar(16) DEFAULT '0.2',
	`isDefault` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `local_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`displayName` varchar(128),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`mustChangePassword` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastLoginAt` timestamp,
	`lastLoginIp` varchar(64),
	CONSTRAINT `local_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `login_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(64) NOT NULL,
	`ip` varchar(64) NOT NULL,
	`userAgent` varchar(512),
	`success` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `replace_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pattern` varchar(255) NOT NULL,
	`replacement` varchar(255) NOT NULL,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `replace_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `replace_rules_pattern_unique` UNIQUE(`pattern`)
);
