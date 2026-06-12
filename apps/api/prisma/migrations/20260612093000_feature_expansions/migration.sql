ALTER TABLE `FileAsset` ADD COLUMN `inventoryItemId` VARCHAR(191) NULL;

ALTER TABLE `PurchaseOrder` ADD COLUMN `catalogNumber` VARCHAR(191) NULL;

CREATE INDEX `FileAsset_inventoryItemId_idx` ON `FileAsset`(`inventoryItemId`);

ALTER TABLE `FileAsset`
  ADD CONSTRAINT `FileAsset_inventoryItemId_fkey`
  FOREIGN KEY (`inventoryItemId`) REFERENCES `InventoryItem`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
