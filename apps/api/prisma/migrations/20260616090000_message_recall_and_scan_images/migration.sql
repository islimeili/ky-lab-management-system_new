ALTER TABLE `FileAsset`
  MODIFY `kind` ENUM('CHEMICAL_IMAGE', 'CHEMICAL_3D_IMAGE', 'PROTOCOL_VIDEO', 'PROTOCOL_ATTACHMENT', 'RUN_ATTACHMENT') NOT NULL;

ALTER TABLE `TeamMessage`
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `senderDeletedAt` DATETIME(3) NULL,
  ADD COLUMN `recipientDeletedAt` DATETIME(3) NULL;

CREATE INDEX `TeamMessage_teamId_kind_deletedAt_createdAt_idx`
  ON `TeamMessage`(`teamId`, `kind`, `deletedAt`, `createdAt`);
