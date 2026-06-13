CREATE TABLE `MouseCage` (
  `id` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `cageCode` VARCHAR(191) NOT NULL,
  `location` VARCHAR(191) NULL,
  `rack` VARCHAR(191) NULL,
  `layer` VARCHAR(191) NULL,
  `capacity` INTEGER NULL,
  `strain` VARCHAR(191) NULL,
  `caretakerUserId` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `notes` TEXT NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MouseAnimal` (
  `id` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `cageId` VARCHAR(191) NULL,
  `animalCode` VARCHAR(191) NOT NULL,
  `strain` VARCHAR(191) NULL,
  `genotype` VARCHAR(191) NULL,
  `sex` ENUM('MALE', 'FEMALE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `birthDate` DATETIME(3) NULL,
  `source` VARCHAR(191) NULL,
  `supplier` VARCHAR(191) NULL,
  `batchNumber` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE', 'EXPERIMENT', 'BREEDING', 'PENDING_DISPOSAL', 'DISPOSED', 'DEAD', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `notes` TEXT NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MouseBreedingPair` (
  `id` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `cageId` VARCHAR(191) NULL,
  `fatherMouseId` VARCHAR(191) NULL,
  `motherMouseId` VARCHAR(191) NULL,
  `pairDate` DATETIME(3) NULL,
  `separatedDate` DATETIME(3) NULL,
  `litterDate` DATETIME(3) NULL,
  `weanDate` DATETIME(3) NULL,
  `litterCount` INTEGER NULL,
  `offspringCount` INTEGER NULL,
  `status` ENUM('PAIRING', 'PREGNANT', 'LITTER_BORN', 'WEANED', 'CLOSED', 'ARCHIVED') NOT NULL DEFAULT 'PAIRING',
  `notes` TEXT NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MouseExperimentRecord` (
  `id` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NOT NULL,
  `mouseId` VARCHAR(191) NOT NULL,
  `operatorUserId` VARCHAR(191) NOT NULL,
  `recordType` ENUM('DOSING', 'SAMPLING', 'SURGERY', 'BEHAVIOR', 'EUTHANASIA', 'OTHER') NOT NULL DEFAULT 'OTHER',
  `title` VARCHAR(191) NOT NULL,
  `performedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notes` TEXT NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MouseCage_teamId_status_idx` ON `MouseCage`(`teamId`, `status`);
CREATE UNIQUE INDEX `MouseCage_teamId_cageCode_key` ON `MouseCage`(`teamId`, `cageCode`);
CREATE INDEX `MouseAnimal_teamId_status_idx` ON `MouseAnimal`(`teamId`, `status`);
CREATE INDEX `MouseAnimal_teamId_cageId_idx` ON `MouseAnimal`(`teamId`, `cageId`);
CREATE UNIQUE INDEX `MouseAnimal_teamId_animalCode_key` ON `MouseAnimal`(`teamId`, `animalCode`);
CREATE INDEX `MouseBreedingPair_teamId_status_idx` ON `MouseBreedingPair`(`teamId`, `status`);
CREATE INDEX `MouseBreedingPair_teamId_cageId_idx` ON `MouseBreedingPair`(`teamId`, `cageId`);
CREATE INDEX `MouseExperimentRecord_teamId_performedAt_idx` ON `MouseExperimentRecord`(`teamId`, `performedAt`);
CREATE INDEX `MouseExperimentRecord_mouseId_performedAt_idx` ON `MouseExperimentRecord`(`mouseId`, `performedAt`);

ALTER TABLE `MouseCage`
  ADD CONSTRAINT `MouseCage_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MouseCage`
  ADD CONSTRAINT `MouseCage_caretakerUserId_fkey`
  FOREIGN KEY (`caretakerUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MouseAnimal`
  ADD CONSTRAINT `MouseAnimal_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MouseAnimal`
  ADD CONSTRAINT `MouseAnimal_cageId_fkey`
  FOREIGN KEY (`cageId`) REFERENCES `MouseCage`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MouseBreedingPair`
  ADD CONSTRAINT `MouseBreedingPair_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MouseBreedingPair`
  ADD CONSTRAINT `MouseBreedingPair_cageId_fkey`
  FOREIGN KEY (`cageId`) REFERENCES `MouseCage`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MouseBreedingPair`
  ADD CONSTRAINT `MouseBreedingPair_fatherMouseId_fkey`
  FOREIGN KEY (`fatherMouseId`) REFERENCES `MouseAnimal`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MouseBreedingPair`
  ADD CONSTRAINT `MouseBreedingPair_motherMouseId_fkey`
  FOREIGN KEY (`motherMouseId`) REFERENCES `MouseAnimal`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `MouseExperimentRecord`
  ADD CONSTRAINT `MouseExperimentRecord_teamId_fkey`
  FOREIGN KEY (`teamId`) REFERENCES `Team`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MouseExperimentRecord`
  ADD CONSTRAINT `MouseExperimentRecord_mouseId_fkey`
  FOREIGN KEY (`mouseId`) REFERENCES `MouseAnimal`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MouseExperimentRecord`
  ADD CONSTRAINT `MouseExperimentRecord_operatorUserId_fkey`
  FOREIGN KEY (`operatorUserId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
