-- CreateTable
CREATE TABLE `admin_users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'VIEWER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bots` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `login` VARCHAR(191) NOT NULL,
    `encryptedPassword` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OFFLINE',
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `operationMode` VARCHAR(191) NOT NULL DEFAULT 'OBSERVER',
    `strategyProfileId` VARCHAR(191) NULL,
    `defaultBuyIn` DOUBLE NOT NULL DEFAULT 1000,
    `minBuyIn` DOUBLE NOT NULL DEFAULT 200,
    `maxBuyIn` DOUBLE NOT NULL DEFAULT 5000,
    `dailyLossLimit` DOUBLE NOT NULL DEFAULT -5000,
    `sessionLossLimit` DOUBLE NOT NULL DEFAULT -2000,
    `maxTables` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bots_login_key`(`login`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `workerId` VARCHAR(191) NULL,
    `browserSessionId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `startBalance` DOUBLE NULL,
    `endBalance` DOUBLE NULL,
    `profitLoss` DOUBLE NULL,
    `handsPlayed` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `lastHeartbeatAt` DATETIME(3) NULL,
    `errorMessage` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poker_tables` (
    `id` VARCHAR(191) NOT NULL,
    `externalTableId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `gameType` VARCHAR(191) NOT NULL DEFAULT 'NLH',
    `limitType` VARCHAR(191) NOT NULL DEFAULT 'NL',
    `smallBlind` DOUBLE NOT NULL DEFAULT 1,
    `bigBlind` DOUBLE NOT NULL DEFAULT 2,
    `ante` DOUBLE NOT NULL DEFAULT 0,
    `minBuyIn` DOUBLE NOT NULL DEFAULT 200,
    `maxBuyIn` DOUBLE NOT NULL DEFAULT 5000,
    `maxPlayers` INTEGER NOT NULL DEFAULT 9,
    `isAllowedForBots` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `poker_tables_externalTableId_key`(`externalTableId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_table_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `botSessionId` VARCHAR(191) NULL,
    `seatNumber` INTEGER NULL,
    `buyIn` DOUBLE NULL,
    `startStack` DOUBLE NULL,
    `currentStack` DOUBLE NULL,
    `profitLoss` DOUBLE NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `strategy_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `difficulty` VARCHAR(191) NOT NULL DEFAULT 'EASY',
    `configurationJson` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `strategy_profiles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poker_hands` (
    `id` VARCHAR(191) NOT NULL,
    `externalHandId` VARCHAR(191) NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `gameType` VARCHAR(191) NOT NULL DEFAULT 'NLH',
    `smallBlind` DOUBLE NOT NULL,
    `bigBlind` DOUBLE NOT NULL,
    `ante` DOUBLE NOT NULL DEFAULT 0,
    `buttonSeat` INTEGER NULL,
    `boardJson` VARCHAR(191) NULL,
    `pot` DOUBLE NOT NULL DEFAULT 0,
    `rake` DOUBLE NOT NULL DEFAULT 0,
    `rawStateJson` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_hands` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `handId` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `holeCardsEncrypted` VARCHAR(191) NULL,
    `startStack` DOUBLE NULL,
    `endStack` DOUBLE NULL,
    `profitLoss` DOUBLE NULL,
    `result` VARCHAR(191) NULL,
    `showdown` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hand_actions` (
    `id` VARCHAR(191) NOT NULL,
    `handId` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NULL,
    `externalPlayerId` VARCHAR(191) NULL,
    `street` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `potBefore` DOUBLE NULL,
    `potAfter` DOUBLE NULL,
    `stackBefore` DOUBLE NULL,
    `stackAfter` DOUBLE NULL,
    `isBotAction` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_decisions` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `handId` VARCHAR(191) NOT NULL,
    `turnId` VARCHAR(191) NOT NULL,
    `street` VARCHAR(191) NULL,
    `stateJson` VARCHAR(191) NULL,
    `allowedActionsJson` VARCHAR(191) NULL,
    `decision` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NULL,
    `confidence` DOUBLE NOT NULL DEFAULT 1,
    `reason` VARCHAR(191) NULL,
    `strategyVersion` VARCHAR(191) NULL,
    `processingTimeMs` INTEGER NULL,
    `executed` BOOLEAN NOT NULL DEFAULT false,
    `executionError` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_limits` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `maxDailyLoss` DOUBLE NOT NULL DEFAULT -5000,
    `maxSessionLoss` DOUBLE NOT NULL DEFAULT -2000,
    `maxHandsPerSession` INTEGER NOT NULL DEFAULT 500,
    `maxSessionDurationMinutes` INTEGER NOT NULL DEFAULT 480,
    `maxBuyIn` DOUBLE NOT NULL DEFAULT 5000,
    `minBalance` DOUBLE NOT NULL DEFAULT 100,
    `autoStopEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bot_limits_botId_key`(`botId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `beforeJson` VARCHAR(191) NULL,
    `afterJson` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bots` ADD CONSTRAINT `bots_strategyProfileId_fkey` FOREIGN KEY (`strategyProfileId`) REFERENCES `strategy_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_sessions` ADD CONSTRAINT `bot_sessions_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_table_sessions` ADD CONSTRAINT `bot_table_sessions_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_table_sessions` ADD CONSTRAINT `bot_table_sessions_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `poker_tables`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poker_hands` ADD CONSTRAINT `poker_hands_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `poker_tables`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_hands` ADD CONSTRAINT `bot_hands_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_hands` ADD CONSTRAINT `bot_hands_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `poker_hands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hand_actions` ADD CONSTRAINT `hand_actions_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `poker_hands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hand_actions` ADD CONSTRAINT `hand_actions_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_decisions` ADD CONSTRAINT `bot_decisions_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_decisions` ADD CONSTRAINT `bot_decisions_handId_fkey` FOREIGN KEY (`handId`) REFERENCES `poker_hands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bot_limits` ADD CONSTRAINT `bot_limits_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `bots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
