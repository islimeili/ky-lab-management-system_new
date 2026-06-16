type DecimalLike = { toString(): string };

type InventoryItemLike = {
  quantity: DecimalLike | number;
};

type InventoryEventLike = {
  quantityBefore: DecimalLike | number;
  quantityDelta: DecimalLike | number;
  quantityAfter: DecimalLike | number;
};

type FileLike = {
  sizeBytes: bigint | number;
  kind?: string;
};

type ExperimentRunLike = Record<string, unknown>;

export function serializeInventoryItem<T extends InventoryItemLike>(item: T) {
  const record = item as T & {
    imageFile?: FileLike | null;
    imageFiles?: FileLike[];
  };
  const attachedFiles = Array.isArray(record.imageFiles) ? record.imageFiles.map(serializeFile) : record.imageFiles;
  const imageFiles = Array.isArray(attachedFiles)
    ? attachedFiles.filter((file) => file.kind !== "CHEMICAL_3D_IMAGE")
    : attachedFiles;
  const scanImageFiles = Array.isArray(attachedFiles)
    ? attachedFiles.filter((file) => file.kind === "CHEMICAL_3D_IMAGE")
    : [];

  return {
    ...item,
    quantity: Number(item.quantity),
    imageFile: record.imageFile ? serializeFile(record.imageFile) : record.imageFile,
    imageFiles,
    scanImageFiles
  };
}

export function serializeInventoryEvent<T extends InventoryEventLike>(event: T) {
  return {
    ...event,
    quantityBefore: Number(event.quantityBefore),
    quantityDelta: Number(event.quantityDelta),
    quantityAfter: Number(event.quantityAfter)
  };
}

export function serializeFile<T extends FileLike>(file: T) {
  return {
    ...file,
    sizeBytes: Number(file.sizeBytes)
  };
}

export function serializeRun<T extends ExperimentRunLike>(run: T) {
  return {
    ...run
  };
}
