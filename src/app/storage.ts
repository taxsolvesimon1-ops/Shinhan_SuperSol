/**
 * 브라우저 저장 — 서버·DB 없음. localStorage 한 키에만 저장한다.
 * 사생활 모드·저장 차단 환경에서는 조용히 실패하고 메모리로만 동작한다.
 */
import type { CoinInput } from "./tax";

export const STORAGE_KEY = "cointax.calc.v1";

export type StoredState = {
  version: 1;
  selectedTokens: string[];
  inputs: Record<string, CoinInput>;
  savedIds: string[];
  savedAt: string | null;
};

export const EMPTY_STATE: StoredState = {
  version: 1,
  selectedTokens: [],
  inputs: {},
  savedIds: [],
  savedAt: null,
};

export function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (parsed.version !== 1) return EMPTY_STATE;
    return {
      version: 1,
      selectedTokens: Array.isArray(parsed.selectedTokens) ? parsed.selectedTokens : [],
      inputs: parsed.inputs && typeof parsed.inputs === "object" ? parsed.inputs : {},
      savedIds: Array.isArray(parsed.savedIds) ? parsed.savedIds : [],
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: StoredState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function storageAvailable(): boolean {
  try {
    const k = "__cointax_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
