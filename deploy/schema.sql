-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'operator',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(64) NOT NULL,
    `value` LONGTEXT NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reefers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `container_no` VARCHAR(20) NOT NULL,
    `device_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NULL,
    `brand` VARCHAR(60) NULL,
    `model` VARCHAR(60) NULL,
    `target_temp` DOUBLE NULL,
    `tolerance` DOUBLE NULL,
    `tags` VARCHAR(255) NOT NULL DEFAULT '',
    `notes` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `last_seen_at` DATETIME(3) NULL,
    `set_temp` DOUBLE NULL,
    `supply_temp` DOUBLE NULL,
    `return_temp` DOUBLE NULL,
    `humidity` DOUBLE NULL,
    `voltage` DOUBLE NULL,
    `current` DOUBLE NULL,
    `power_on` BOOLEAN NULL,
    `fault_code` INTEGER NULL,
    `mode` VARCHAR(40) NULL,
    `run_hours` DOUBLE NULL,
    `extra` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reefers_container_no_key`(`container_no`),
    UNIQUE INDEX `reefers_device_id_key`(`device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `readings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `reefer_id` INTEGER NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `set_temp` DOUBLE NULL,
    `supply_temp` DOUBLE NULL,
    `return_temp` DOUBLE NULL,
    `humidity` DOUBLE NULL,
    `voltage` DOUBLE NULL,
    `current` DOUBLE NULL,
    `power_on` BOOLEAN NULL,
    `fault_code` INTEGER NULL,

    INDEX `readings_reefer_id_at_idx`(`reefer_id`, `at`),
    INDEX `readings_at_idx`(`at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alert_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `metric` VARCHAR(30) NOT NULL,
    `operator` VARCHAR(10) NOT NULL DEFAULT 'gt',
    `threshold` DOUBLE NOT NULL DEFAULT 0,
    `threshold2` DOUBLE NULL,
    `use_tolerance` BOOLEAN NOT NULL DEFAULT false,
    `duration_sec` INTEGER NOT NULL DEFAULT 0,
    `severity` VARCHAR(10) NOT NULL DEFAULT 'warning',
    `scope` VARCHAR(10) NOT NULL DEFAULT 'all',
    `scope_value` TEXT NOT NULL DEFAULT '[]',
    `repeat_min` INTEGER NOT NULL DEFAULT 0,
    `notify_email` BOOLEAN NOT NULL DEFAULT false,
    `notify_hook` BOOLEAN NOT NULL DEFAULT false,
    `auto_resolve` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rule_overrides` (
    `rule_id` INTEGER NOT NULL,
    `reefer_id` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `threshold` DOUBLE NULL,
    `threshold2` DOUBLE NULL,
    `duration_sec` INTEGER NULL,
    `severity` VARCHAR(10) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `rule_overrides_reefer_id_idx`(`reefer_id`),
    PRIMARY KEY (`rule_id`, `reefer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rule_states` (
    `rule_id` INTEGER NOT NULL,
    `reefer_id` INTEGER NOT NULL,
    `since` DATETIME(3) NOT NULL,
    `suppressed` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`rule_id`, `reefer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rule_id` INTEGER NULL,
    `reefer_id` INTEGER NOT NULL,
    `severity` VARCHAR(10) NOT NULL,
    `status` VARCHAR(15) NOT NULL DEFAULT 'active',
    `title` VARCHAR(200) NOT NULL,
    `message` TEXT NOT NULL,
    `value` DOUBLE NULL,
    `triggered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledged_at` DATETIME(3) NULL,
    `acknowledged_by` VARCHAR(100) NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolved_by` VARCHAR(100) NULL,
    `last_notified_at` DATETIME(3) NULL,
    `note` TEXT NULL,

    INDEX `alerts_status_triggered_at_idx`(`status`, `triggered_at`),
    INDEX `alerts_reefer_id_status_idx`(`reefer_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reefer_id` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `value` VARCHAR(40) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `error` TEXT NULL,
    `created_by` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `commands_reefer_id_created_at_idx`(`reefer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discovered_devices` (
    `device_id` VARCHAR(64) NOT NULL,
    `topic` VARCHAR(255) NOT NULL,
    `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL,
    `messages` INTEGER NOT NULL DEFAULT 1,
    `last_payload` LONGTEXT NOT NULL,
    `ignored` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`device_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `readings` ADD CONSTRAINT `readings_reefer_id_fkey` FOREIGN KEY (`reefer_id`) REFERENCES `reefers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `alert_rules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_reefer_id_fkey` FOREIGN KEY (`reefer_id`) REFERENCES `reefers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commands` ADD CONSTRAINT `commands_reefer_id_fkey` FOREIGN KEY (`reefer_id`) REFERENCES `reefers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

