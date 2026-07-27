CREATE TABLE `settings` (
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
