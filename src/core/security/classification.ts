import { CLASSIFICATIONS, type DataClassification } from "../types";

export function classificationRank(c: DataClassification): number {
  return CLASSIFICATIONS.indexOf(c);
}

export function maxClassification(a: DataClassification, b: DataClassification): DataClassification {
  return classificationRank(a) >= classificationRank(b) ? a : b;
}

export function exceeds(c: DataClassification, ceiling: DataClassification): boolean {
  return classificationRank(c) > classificationRank(ceiling);
}

export const CLASSIFICATION_LABEL: Record<DataClassification, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
  restricted: "Restricted",
};
