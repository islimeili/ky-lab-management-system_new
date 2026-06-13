CREATE TABLE `TeamMessage` (
  `id` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `senderUserId` VARCHAR(191) NOT NULL,
  `recipientUserId` VARCHAR(191) NULL,
  `kind` ENUM('DIRECT', 'ANNOUNCEMENT') NOT NULL,
  `title` VARCHAR(191) NULL,
  `body` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `TeamMessage_teamId_kind_createdAt_idx` ON `TeamMessage`(`teamId`, `kind`, `createdAt`);
CREATE INDEX `TeamMessage_teamId_recipientUserId_createdAt_idx` ON `TeamMessage`(`teamId`, `recipientUserId`, `createdAt`);
CREATE INDEX `TeamMessage_senderUserId_createdAt_idx` ON `TeamMessage`(`senderUserId`, `createdAt`);

ALTER TABLE `TeamMessage`
  ADD CONSTRAINT `TeamMessage_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `TeamMessage`
  ADD CONSTRAINT `TeamMessage_senderUserId_fkey`
  FOREIGN KEY (`senderUserId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `TeamMessage`
  ADD CONSTRAINT `TeamMessage_recipientUserId_fkey`
  FOREIGN KEY (`recipientUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
