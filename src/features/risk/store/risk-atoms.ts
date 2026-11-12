import { atom } from "jotai";

/**
 * Per-node risk scores for the editor canvas.
 * Key: React Flow node id, value: risk score 0–100.
 */
export const nodeRiskAtom = atom<Record<string, number>>({});
