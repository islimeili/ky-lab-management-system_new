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
};

type ExperimentRunLike = Record<string, unknown>;

export function serializeInventoryItem<T extends InventoryItemLike>(item: T) {
  return {
    ...item,
    quantity: Number(item.quantity)
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
