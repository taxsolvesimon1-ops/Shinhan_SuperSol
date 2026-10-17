/**
 * 앱 사용 기록 — /track.js(공용)를 통해 Supabase에 집계용 이벤트만 남긴다.
 * 금액·코인명·이름·연락처는 보내지 않는다. track.js가 없으면 조용히 무시.
 */
export type AppEvent = "enter" | "start" | "input" | "complete" | "understood" | "example" | "cta_kakao" | "retry";

declare global {
  interface Window {
    ctTrack?: (page: string, event: string, meta?: Record<string, string | number | boolean>, once?: boolean) => void;
    ctWithUtm?: (base: string) => string;
  }
}

const ONCE: AppEvent[] = ["enter", "start", "input", "complete"];

export function track(event: AppEvent, meta: Record<string, string | number | boolean> = {}) {
  try {
    window.ctTrack?.("app", event, meta, ONCE.includes(event));
  } catch {
    /* 기록 실패는 앱 동작에 영향 주지 않음 */
  }
}

export const KAKAO_CHAT = "https://pf.kakao.com/_uhgxaX/chat";
