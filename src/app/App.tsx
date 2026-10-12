import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, ChevronDown, BookOpen, Calculator, Home, CheckCircle2, Save, Trash2, RotateCcw, AlertCircle } from "lucide-react";
import coinTaxLogo from "@/assets/coin_tax.png";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/app/components/ui/accordion";
import { calculateCoin, calculateTax, EMPTY_COIN_INPUT, TAX_RULES, type CoinInput, type AcquisitionMethod } from "./tax";
import { clearState, loadState, saveState, storageAvailable, type StoredState } from "./storage";

/*
 * 스타일 원칙 (cointax-design-settings 적용)
 *  - 색·간격·모서리·글자는 design.css(주 세트) / design-ext.css(확장) 토큰만 사용. 이 파일에 hex 없음.
 *  - 한 화면에 블루 주요 행동 하나. 보조 행동은 흰 바탕 테두리(ds-button-secondary) 또는 연블루(ds-button-soft).
 *  - 조건(특례·의제·입력값 기준)은 결과와 같은 영역에, 결과보다 먼저.
 *  - 미응답은 '아니요'로 바꾸지 않는다(보유 질문 null 상태).
 */

// ── constants ──────────────────────────────────────────────────────────────

type Screen = "home" | "info" | "detail" | "tokens" | "calc" | "tax";
type DetailId = "양도대가" | "취득가액" | "부대비용";

const AS_OF = `(${TAX_RULES.asOf})`;

const C = {
  primary: "var(--ds-color-action-primary)",
  text: "var(--ds-color-text-primary)",
  strong: "var(--ds-color-text-strong)",
  secondary: "var(--ds-color-text-secondary)",
  muted: "var(--ds-color-text-muted)",
  border: "var(--ds-color-border-default)",
  cond: "var(--ds-color-status-conditional)",
  success: "var(--ds-ext-color-success-text)",
  successBg: "var(--ds-ext-color-success-bg)",
  error: "var(--ds-ext-color-error-text)",
  warningText: "var(--ds-ext-color-warning-text)",
  warningBg: "var(--ds-ext-color-warning-bg)",
  soft: "var(--ds-ext-color-action-soft)",
  pressed: "var(--ds-ext-color-action-pressed)",
  white: "var(--ds-color-white)",
} as const;

const DETAIL_CONTENT: Record<DetailId, { title: string; summary: string; sections: { heading: string; body: string }[] }> = {
  양도대가: {
    title: "가상자산의 양도대가",
    summary: "가상자산 종류별로 한 해 동안 받은 총 양도대가를 말합니다.",
    sections: [
      { heading: "양도대가란?", body: "가상자산을 양도·대여하고 그 대가로 받는 금액 전체입니다. 현금 외에 다른 가상자산이나 재산적 가치가 있는 모든 것을 포함합니다." },
      { heading: "현금 등을 받은 경우", body: "받은 원화(외화는 환산) 금액 전액이 양도대가입니다." },
      { heading: "코인끼리 교환한 경우", body: "교환도 양도에 해당합니다. 기축가상자산(BTC마켓의 비트코인, USDT마켓의 테더 등)의 가액에 대상 가상자산의 교환비율을 적용해 계산합니다." },
    ],
  },
  취득가액: {
    title: "가상자산의 취득가액",
    summary: "가상자산을 취득할 때 실제로 지출한 금액으로, 가상자산 종류별로 총평균법으로 계산합니다.",
    sections: [
      { heading: "취득가액이란?", body: "가상자산의 매입가액과 취득 시 발생한 수수료 등 부대비용을 말합니다." },
      { heading: "총평균법이란?", body: "양도한 가상자산을 여러 번에 나눠 취득했다면, 해당 가상자산의 총 취득가액을 총 취득수량으로 나누어 1개당 평균 취득가액을 계산합니다." },
      { heading: "시행 전 보유분 취득가액 특례 (소득세법 제37조제5항)", body: `${TAX_RULES.effectiveDate} 전부터 보유한 가상자산은 실제 취득가액과 시행일 0시 시가 중 큰 금액을 취득가액으로 합니다. 취득가액이 확정되는 시점이 ${TAX_RULES.effectiveDate}이므로, 그 전에 실제 취득가를 정리해 두는 것이 좋습니다.` },
      { heading: "취득가액 확인이 곤란할 때 (필요경비 50% 의제)", body: "실제 취득가액을 확인할 수 없으면 동종 가상자산 전체에 대해 양도가액의 50%를 필요경비로 의제할 수 있습니다. 이 경우 별도의 부대비용은 인정하지 않습니다." },
    ],
  },
  부대비용: {
    title: "부대비용 (필요경비)",
    summary: "가상자산 거래 과정에서 실제로 지출한 수수료 등입니다. 취득 수수료는 취득가액에, 양도 수수료는 부대비용에 들어가지만 결과적으로 모두 양도차익을 줄입니다.",
    sections: [
      { heading: "부대비용이란?", body: "가상자산의 취득·양도와 직접 관련해 지출한 비용입니다." },
      { heading: "공제 가능한 비용", body: "거래소 매수·매도 수수료, 출금 수수료, 네트워크 이용료(가스비) 등 실제 지출이 확인되는 비용입니다." },
      { heading: "공제 불가 비용", body: "단순 지갑 이전 수수료 등 양도·대여와 직접 관련 없는 비용은 공제되지 않습니다." },
      { heading: "증빙 필수", body: "거래소 수수료 내역, 블록체인 트랜잭션 기록 등 지출을 증명할 수 있는 자료가 있어야 인정됩니다." },
    ],
  },
};

const FAQ: [string, string][] = [
  ["나도 세금을 내야 하나요?", `2027년에 판 코인의 양도차익(판 금액 − 산 금액 − 수수료)을 모두 더해 연 250만 원 이하이면 신고·납부할 세금이 없습니다. 이 앱은 그 판정을 결과 첫 줄에 보여줍니다. ${AS_OF}`],
  ["500만 원 벌면 세금은 얼마인가요?", "기본공제 250만 원을 뺀 과세표준 250만 원에 소득세 20%(50만 원)와 지방소득세 2%(5만 원)를 적용하면 55만 원입니다. 입력값 기준 계산이며 실제 신고는 거래 기록으로 합니다."],
  ["손실이 난 코인도 합산하나요?", "네. 코인별 손익을 모두 합산합니다. 총 양도차익이 0 이하이면 기본공제와 과세표준은 0원이며 '신고·납부 없음'으로 표시됩니다."],
  ["산 가격을 모르면 어떻게 하나요?", `${TAX_RULES.effectiveDate} 전부터 보유했다면 시행일 0시 시가를 먼저 적용합니다(소득세법 §37⑤). 시가도 없으면 양도가액의 50%를 필요경비로 의제하며, 별도 수수료는 공제하지 않습니다.`],
  [`${TAX_RULES.effectiveDate} 전부터 보유한 코인은요?`, "실제 취득가액과 시행일 0시 시가 중 큰 금액을 자동 적용합니다. 시가는 양도한 수량에 해당하는 총액을 입력해 주세요."],
  ["입력한 내용은 어디에 저장되나요?", "이 기기의 브라우저 안에만 저장되고 서버로 보내지 않습니다. 거래내역 파일 업로드나 지갑 연결도 없습니다. '입력 지우기'를 누르면 바로 삭제됩니다."],
  ["여기 나온 숫자로 신고하면 되나요?", `아니요. 입력값 기준의 확인용 계산입니다. 신고는 실제 거래 기록으로 해야 하고, 신고·납부 기한은 ${TAX_RULES.filingDeadline}입니다(2027년 양도분). ${AS_OF}`],
];

const TOKENS = [
  { id: "btc", name: "비트코인", symbol: "BTC", dot: "#F7931A" },
  { id: "eth", name: "이더리움", symbol: "ETH", dot: "#627EEA" },
  { id: "xrp", name: "리플", symbol: "XRP", dot: "#346AA9" },
  { id: "sol", name: "솔라나", symbol: "SOL", dot: "#9945FF" },
];
const LISTED_COINS = [
  { id: "bnb", name: "바이낸스", symbol: "BNB", dot: "#F3BA2F" },
  { id: "ada", name: "에이다", symbol: "ADA", dot: "#0033AD" },
  { id: "doge", name: "도지코인", symbol: "DOGE", dot: "#C2A633" },
  { id: "avax", name: "아발란체", symbol: "AVAX", dot: "#E84142" },
  { id: "dot", name: "폴카닷", symbol: "DOT", dot: "#E6007A" },
  { id: "link", name: "체인링크", symbol: "LINK", dot: "#375BD2" },
  { id: "atom", name: "코스모스", symbol: "ATOM", dot: "#6F7390" },
  { id: "xlm", name: "스텔라루멘", symbol: "XLM", dot: "#7B68EE" },
  { id: "trx", name: "트론", symbol: "TRX", dot: "#EB0029" },
  { id: "uni", name: "유니스왑", symbol: "UNI", dot: "#FF007A" },
  { id: "near", name: "니어", symbol: "NEAR", dot: "#555555" },
  { id: "matic", name: "폴리곤", symbol: "POL", dot: "#8247E5" },
  { id: "klay", name: "클레이튼", symbol: "KLAY", dot: "#FF6C00" },
  { id: "wemix", name: "위믹스", symbol: "WEMIX", dot: "#4A90E2" },
  { id: "sand", name: "샌드박스", symbol: "SAND", dot: "#00ADEF" },
];
const ALL_COINS = [...TOKENS, ...LISTED_COINS];
type CoinDisplay = { id: string; name: string; symbol: string; dot: string };
function getCoinDisplay(id: string): CoinDisplay {
  if (id.startsWith("custom_")) {
    const name = id.replace("custom_", "");
    return { id, name, symbol: name, dot: "#8B95A1" };
  }
  return ALL_COINS.find((c) => c.id === id) ?? { id, name: id, symbol: id, dot: "#8B95A1" };
}

// ── helpers ─────────────────────────────────────────────────────────────────

const fmtKRW = (n: number) => n.toLocaleString("ko-KR");
const fmtSigned = (n: number) => `${n < 0 ? "−" : ""}${fmtKRW(Math.abs(n))}`;
const parseKRW = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0;
function fmtInput(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 15);
  return d ? parseInt(d, 10).toLocaleString("ko-KR") : "";
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
const methodChipClass = (m: AcquisitionMethod) => (m === "실제 취득가 적용" ? "ds-chip ds-chip-neutral" : "ds-chip ds-chip-conditional");
const amountColor = (n: number) => (n > 0 ? C.primary : n < 0 ? C.error : C.secondary);

// ── shared ui ───────────────────────────────────────────────────────────────

function Header({ title, onBack, step }: { title: string; onBack?: () => void; step?: number }) {
  return (
    <header className="app-header">
      {onBack ? (
        <button onClick={onBack} aria-label="뒤로" className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center" style={{ color: C.strong }}>
          <ChevronLeft size={22} />
        </button>
      ) : (
        <img src={coinTaxLogo} alt="" className="w-7 h-7 object-contain" />
      )}
      <span className="ds-type-header" style={{ color: C.text }}>{title}</span>
      {step !== undefined && (
        <>
          <div className="flex-1" />
          <span className="ds-type-headersecondary" style={{ color: C.muted }} aria-label={`3단계 중 ${step}단계`}>{step} / 3</span>
          <div className="flex gap-1 ml-1" aria-hidden>
            {[1, 2, 3].map((s) => (
              <div key={s} className="h-1.5 w-4 rounded-full" style={{ background: s <= step ? C.primary : C.border }} />
            ))}
          </div>
        </>
      )}
    </header>
  );
}

function Note({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "success" }) {
  const bg = tone === "warning" ? C.warningBg : tone === "success" ? C.successBg : "var(--ds-color-surface-result)";
  const fg = tone === "warning" ? C.warningText : tone === "success" ? C.success : C.secondary;
  return (
    <div className="ds-type-note rounded-[14px] px-4 py-3" style={{ background: bg, color: fg }}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="ds-button w-full flex items-center justify-center gap-2" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ── screen 1: home ──────────────────────────────────────────────────────────

function HomeScreen({ onInfo, onCalc, saved, onResume, onReset }: {
  onInfo: () => void; onCalc: () => void;
  saved: { count: number; savedAt: string | null } | null;
  onResume: () => void; onReset: () => void;
}) {
  return (
    <div>
      <h1 className="ds-ext-type-title mb-3">
        코인 세금, 나도 내야 하나?
        <br />
        3분이면 압니다.
      </h1>
      <p className="ds-type-chat mb-6" style={{ color: C.secondary }}>
        세무사가 설계하고 검수한 안내와 계산.
        <br />
        질문 몇 개로 내가 내는 사람인지부터 확인합니다.
      </p>

      {saved && saved.count > 0 && (
        <div className="app-card mb-4" style={{ background: C.soft }}>
          <p className="ds-type-condition" style={{ color: C.primary }}>이 기기에 저장된 계산 · 코인 {saved.count}개</p>
          {saved.savedAt && <p className="ds-type-note mt-0.5" style={{ color: C.secondary }}>{fmtDate(saved.savedAt)} 저장</p>}
          <div className="flex gap-2 mt-3">
            <button type="button" className="ds-button flex-1" onClick={onResume}>이어서 보기</button>
            <button type="button" className="ds-button-secondary flex items-center gap-1.5" onClick={onReset}><RotateCcw size={15} /> 새로</button>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        <button type="button" onClick={onCalc} className="ds-button w-full flex items-center justify-between" style={{ minHeight: 56 }}>
          <span className="flex items-center gap-2"><Calculator size={18} /> 세금 계산</span>
          <ChevronRight size={18} />
        </button>
        <button type="button" onClick={onInfo} className="ds-button-soft w-full flex items-center justify-between" style={{ minHeight: 56 }}>
          <span className="flex items-center gap-2"><BookOpen size={18} /> 세금 정보</span>
          <ChevronRight size={18} />
        </button>
      </div>

      <section className="app-card mb-4">
        <p className="ds-type-factlabel mb-2" style={{ color: C.muted }}>2027년 핵심 요약 {AS_OF}</p>
        {[
          { label: "과세 기준", value: "기타소득세 22% (지방소득세 포함)" },
          { label: "기본공제", value: "연 250만 원" },
          { label: "취득가액 확정", value: `${TAX_RULES.effectiveDate} 0시 시가` },
          { label: "신고·납부 기한", value: TAX_RULES.filingDeadline },
        ].map((row) => (
          <div key={row.label} className="app-row">
            <span className="ds-type-resultrow flex-shrink-0" style={{ color: C.secondary }}>{row.label}</span>
            <span className="ds-type-resultrowvalue text-right" style={{ color: C.text }}>{row.value}</span>
          </div>
        ))}
      </section>

      <Note>
        · 거래내역 파일 업로드·지갑 연결 없음. 직접 입력합니다.
        <br />· 입력값은 이 기기의 브라우저에만 저장되고 서버로 보내지 않습니다.
        <br />· 계산 결과는 입력값 기준 참고용이며 개별 세액을 확정하지 않습니다.
      </Note>
      <p className="ds-type-note mt-3" style={{ color: C.muted }}>세무법인케이앤피 · 문의 litt.ly/cointax</p>
    </div>
  );
}

// ── screen 2: info ──────────────────────────────────────────────────────────

function DetailScreen({ id }: { id: DetailId }) {
  const content = DETAIL_CONTENT[id];
  return (
    <div>
      <span className="ds-chip ds-chip-action mb-3">{id}</span>
      <h2 className="ds-ext-type-section mb-2">{content.title}</h2>
      <p className="ds-type-explanation mb-5" style={{ color: C.secondary }}>{content.summary}</p>
      <div className="space-y-3">
        {content.sections.map((sec, i) => (
          <div key={i} className="app-card">
            <p className="ds-type-condition flex items-start gap-2 mb-1.5" style={{ color: C.text }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold mt-0.5" style={{ background: C.primary, color: C.white }}>{i + 1}</span>
              <span>{sec.heading}</span>
            </p>
            <p className="ds-type-explanation pl-7" style={{ color: C.secondary }}>{sec.body}</p>
          </div>
        ))}
      </div>
      <p className="ds-type-note mt-4" style={{ color: C.muted }}>{AS_OF} · 법령이 바뀌면 앱 안 안내로 알려드립니다.</p>
    </div>
  );
}

function InfoScreen({ onSelect }: { onSelect: (id: DetailId) => void }) {
  const INFO: { id: DetailId; label: string; desc: string }[] = [
    { id: "양도대가", label: "양도대가", desc: "양도·대여로 받는 경제적 대가 전체" },
    { id: "취득가액", label: "취득가액", desc: "매입가액과 취득 수수료 / 시행 전 보유분 특례 · 50% 의제" },
    { id: "부대비용", label: "부대비용", desc: "양도 수수료 등 필요경비" },
  ];
  return (
    <div>
      <h2 className="ds-ext-type-title mb-2">가상자산 세금이란?</h2>
      <p className="ds-type-explanation mb-5" style={{ color: C.secondary }}>
        가상자산의 양도대가에서 취득가액과 부대비용을 빼 기타소득금액을 구합니다. 여기서 기본공제 250만 원을 뺀 과세표준에 22%(소득세 20% + 지방소득세 2%)를 적용합니다. {AS_OF}
      </p>

      <div className="space-y-2 mb-6">
        {INFO.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="app-card-outlined w-full flex items-center gap-3 text-left" style={{ padding: "14px 16px" }}>
            <div className="flex-1 min-w-0">
              <p className="ds-type-header" style={{ color: C.text }}>{item.label}</p>
              <p className="ds-type-note mt-0.5" style={{ color: C.secondary }}>{item.desc}</p>
            </div>
            <ChevronRight size={18} style={{ color: C.muted }} className="flex-shrink-0" />
          </button>
        ))}
      </div>

      <section className="app-card">
        <p className="ds-type-header mb-1" style={{ color: C.text }}>자주 묻는 질문</p>
        <p className="ds-type-note mb-2" style={{ color: C.secondary }}>세무사가 미리 정리한 답변입니다. 개별 상담은 제공하지 않습니다.</p>
        <Accordion type="single" collapsible>
          {FAQ.map(([question, answer], i) => (
            <AccordionItem key={question} value={String(i)} style={{ borderColor: C.border }}>
              <AccordionTrigger className="ds-type-factvalue text-left py-3" style={{ color: C.text, fontSize: 14 }}>{question}</AccordionTrigger>
              <AccordionContent className="ds-type-explanation" style={{ color: C.secondary }}>{answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}

// ── screen 3: coin selection ─────────────────────────────────────────────────

function CoinTile({ name, symbol, dot, on, onClick, small = false }: { name: string; symbol: string; dot: string; on: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="app-tile" style={{ padding: small ? "12px 6px" : "18px 8px", fontSize: small ? 13 : 15 }}>
      {on && (
        <span className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: C.primary }}>
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      )}
      <span style={{ color: dot, fontSize: small ? 9 : 11, marginBottom: small ? 4 : 6 }}>●</span>
      {name}
      <span className="ds-type-note" style={{ fontSize: small ? 11 : 12, fontWeight: 400, marginTop: 2, color: C.muted }}>{symbol}</span>
    </button>
  );
}

function TokensScreen({ selected, onToggle, onNext }: { selected: string[]; onToggle: (id: string) => void; onNext: () => void }) {
  const [showList, setShowList] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const addCustom = () => {
    const trimmed = customInput.trim().slice(0, 20);
    if (!trimmed) return;
    const id = `custom_${trimmed}`;
    if (!selected.includes(id)) onToggle(id);
    setCustomInput("");
    setShowCustom(false);
  };

  return (
    <div>
      <h2 className="ds-ext-type-title mb-2">
        2027년에 판 코인을
        <br />
        선택하세요
      </h2>
      <p className="ds-type-explanation mb-5" style={{ color: C.secondary }}>여러 개를 고를 수 있어요. 팔지 않은 코인은 세금이 없습니다.</p>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {TOKENS.map((t) => (
          <CoinTile key={t.id} {...t} on={selected.includes(t.id)} onClick={() => onToggle(t.id)} />
        ))}
      </div>

      <button type="button" onClick={() => setShowList((v) => !v)} aria-expanded={showList}
        className="w-full flex items-center justify-between rounded-[14px] px-4 mb-2"
        style={{ minHeight: 48, border: `1px solid ${showList ? C.primary : C.border}`, background: showList ? C.soft : C.white }}>
        <span className="ds-type-factvalue" style={{ color: showList ? C.primary : C.strong, fontSize: 14 }}>기타 코인 직접 선택</span>
        <ChevronDown size={18} style={{ color: showList ? C.primary : C.muted, transform: showList ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {showList && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="app-card mb-3" style={{ padding: 14 }}>
          <p className="ds-type-factlabel mb-2.5" style={{ color: C.muted }}>국내 거래소 상장 코인</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {LISTED_COINS.map((t) => (
              <CoinTile key={t.id} {...t} on={selected.includes(t.id)} onClick={() => onToggle(t.id)} small />
            ))}
          </div>
          {!showCustom ? (
            <button type="button" onClick={() => setShowCustom(true)} className="w-full flex items-center gap-2 px-4 rounded-[14px]" style={{ minHeight: 44, border: `1px dashed ${C.border}`, background: C.white }}>
              <span className="font-bold" style={{ color: C.primary }}>+</span>
              <span className="ds-type-note" style={{ color: C.secondary }}>직접 입력 (상장폐지·해외 코인)</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <input autoFocus type="text" value={customInput} onChange={(e) => setCustomInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()}
                placeholder="코인명 또는 심볼 입력" aria-label="코인명 또는 심볼"
                className="ds-input flex-1 min-w-0" style={{ fontSize: 16, background: C.white }} />
              <button type="button" onClick={addCustom} className="ds-button" style={{ minHeight: 48 }}>추가</button>
            </div>
          )}
        </motion.div>
      )}

      {selected.length > 0 && (
        <div className="mb-5">
          <p className="ds-type-factlabel mb-2" style={{ color: C.secondary }}>선택한 코인 <span style={{ color: C.primary }}>{selected.length}</span>개</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((id) => {
              const c = getCoinDisplay(id);
              return (
                <span key={id} className="ds-chip ds-chip-action" style={{ paddingRight: 4 }}>
                  <span style={{ color: c.dot, fontSize: 8 }}>●</span>
                  {c.name}
                  <button type="button" onClick={() => onToggle(id)} aria-label={`${c.name} 선택 해제`} className="w-5 h-5 rounded-full flex items-center justify-center font-bold">×</button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <PrimaryButton onClick={onNext} disabled={selected.length === 0}>선택완료</PrimaryButton>
      <p className="ds-type-note mt-3" style={{ color: C.muted }}>· 선택 내역과 입력값은 이 기기에만 저장됩니다.</p>
    </div>
  );
}

// ── screen 4: per-coin calc ──────────────────────────────────────────────────

function AmtInput({ id, label, hint, value, onChange, placeholder, error, onBlur }: {
  id: string; label: string; hint?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; onBlur?: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="ds-type-condition block mb-1" style={{ color: C.text }}>{label}</label>
      {hint && <p className="ds-type-note mb-2" style={{ color: C.secondary }}>{hint}</p>}
      <div className="app-amount-wrap" data-invalid={Boolean(error)}>
        <input id={id} type="text" inputMode="numeric" value={value} placeholder={placeholder}
          onChange={(e) => { if (/^[0-9,]*$/.test(e.target.value)) onChange(fmtInput(e.target.value)); }}
          onBlur={onBlur} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined}
          className="app-amount-input" />
        <span className="ds-type-note ml-2 flex-shrink-0" style={{ color: C.muted }}>원</span>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="ds-type-note mt-1 flex items-center gap-1" style={{ color: C.error }}>
          <AlertCircle size={13} /> {error}
        </p>
      )}
    </div>
  );
}

function CalcScreen({ coins, inputs, onUpdate, savedIds, currentCoinId, onSave, onChangeCoin, onTaxCalc }: {
  coins: CoinDisplay[];
  inputs: Record<string, CoinInput>;
  onUpdate: (coinId: string, patch: Partial<CoinInput>) => void;
  savedIds: string[];
  currentCoinId: string;
  onSave: (coinId: string, chaik: number) => void;
  onChangeCoin: (coinId: string) => void;
  onTaxCalc: () => void;
}) {
  const [touched, setTouched] = useState<Record<string, Set<string>>>({});
  const pendingCoins = coins.filter((c) => !savedIds.includes(c.id));
  const savedCoins = coins.filter((c) => savedIds.includes(c.id));
  const allSaved = pendingCoins.length === 0;

  const currentCoin = coins.find((c) => c.id === currentCoinId);
  const inp = inputs[currentCoinId] ?? EMPTY_COIN_INPUT;

  const touch = (field: string) => setTouched((prev) => ({ ...prev, [currentCoinId]: new Set([...(prev[currentCoinId] ?? []), field]) }));
  const isTouched = (field: string) => touched[currentCoinId]?.has(field) ?? false;

  const result = calculateCoin(inp);
  const { sale, acquisition: buy, expenses: exp } = result;
  const isValid = result.valid;
  const saleError = isTouched("sale") && (!Number.isSafeInteger(sale) || sale <= 0) ? "판 금액을 원 단위 숫자로 입력해 주세요" : undefined;
  const buyError = isTouched("buy") && inp.buyAmt !== "" && parseKRW(inp.buyAmt) <= 0 ? "숫자를 입력하거나 비워 주세요" : undefined;
  const needsAnswer = inp.isOld === null && parseKRW(inp.saleAmt) > 0;

  return (
    <div>
      {!allSaved && (
        <div className="mb-4">
          <p className="ds-type-factlabel mb-2" style={{ color: C.secondary }}>입력 대기 <span style={{ color: C.primary }}>{pendingCoins.length}</span>개</p>
          <div className="flex flex-wrap gap-1.5">
            {pendingCoins.map((c) => {
              const isCurrent = c.id === currentCoinId;
              return (
                <button key={c.id} type="button" onClick={() => onChangeCoin(c.id)} aria-pressed={isCurrent}
                  className="ds-chip" style={{ padding: "6px 12px", fontSize: 13, background: isCurrent ? C.primary : "var(--ds-color-gray-100)", color: isCurrent ? C.white : C.strong }}>
                  <span style={{ color: isCurrent ? "rgba(255,255,255,0.7)" : c.dot, fontSize: 8 }}>●</span>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!allSaved && currentCoin && (
        <>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ background: "var(--ds-color-gray-100)" }}>
              <span style={{ color: currentCoin.dot, fontSize: 18 }}>●</span>
            </div>
            <h2 className="ds-ext-type-section">
              {currentCoin.name} <span className="ds-type-headersecondary" style={{ color: C.muted }}>{currentCoin.symbol}</span>
            </h2>
          </div>

          <div className="space-y-5 mb-4">
            {/* ① 분기 질문 — 답하기 전에는 계산하지 않는다 */}
            <fieldset className="app-card space-y-3">
              <legend className="sr-only">보유 시점</legend>
              <p className="ds-type-condition" style={{ color: C.text }}>① 이 코인, {TAX_RULES.effectiveDate} 전부터 갖고 계셨나요?</p>
              <div className="flex gap-2">
                <button type="button" className="app-choice" aria-pressed={inp.isOld === true} onClick={() => onUpdate(currentCoinId, { isOld: true })}>예, 그 전부터</button>
                <button type="button" className="app-choice" aria-pressed={inp.isOld === false} onClick={() => onUpdate(currentCoinId, { isOld: false })}>아니요, 그 이후</button>
              </div>
              <p className="ds-type-assumption" style={{ color: C.secondary }}>
                {inp.isOld === null
                  ? "답에 따라 취득가액을 정하는 규칙이 달라집니다. 먼저 골라 주세요."
                  : inp.isOld
                    ? "실제 취득가와 시행일 0시 시가 중 큰 금액이 취득가액이 됩니다(소득세법 §37⑤)."
                    : "2027년 이후 산 코인은 실제 취득가가 취득가액입니다. 모르면 양도가액의 50%를 필요경비로 봅니다."}
              </p>
            </fieldset>

            <AmtInput id={`${currentCoinId}-sale`} label="② 2027년에 판 금액 (양도가액)" hint="이 코인을 판 금액의 합계. 다른 코인으로 바꾼 것도 포함"
              value={inp.saleAmt} error={saleError} onBlur={() => touch("sale")} onChange={(v) => onUpdate(currentCoinId, { saleAmt: v })} />

            <AmtInput id={`${currentCoinId}-buy`} label="③ 산 금액 (실제 취득가액)" hint="판 수량에 해당하는 매입 금액. 정확히 몰라도 대략의 값으로 시작할 수 있어요"
              placeholder="확인할 수 없으면 비워 주세요" value={inp.buyAmt} error={buyError} onBlur={() => touch("buy")} onChange={(v) => onUpdate(currentCoinId, { buyAmt: v })} />

            {inp.isOld === true && (
              <AmtInput id={`${currentCoinId}-market`} label={`${TAX_RULES.effectiveDate} 0시 시가`} hint="판 수량 × 시행일 0시 가격. 모르면 비워 두세요"
                placeholder="시가를 모르면 비워 주세요" value={inp.marketAmt} onChange={(v) => onUpdate(currentCoinId, { marketAmt: v })} />
            )}

            <AmtInput id={`${currentCoinId}-exp`} label="수수료 등 필요경비 (선택)" placeholder="없으면 0원으로 처리"
              value={inp.expenses} onChange={(v) => onUpdate(currentCoinId, { expenses: v })} />
          </div>

          {needsAnswer && (
            <div className="mb-4"><Note tone="warning">①번 질문에 답하면 양도차익이 계산됩니다.</Note></div>
          )}

          {isValid && (
            <motion.div key={`${currentCoinId}-result`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="app-card mb-4">
              {/* 조건을 결과보다 먼저 */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={methodChipClass(result.method)}>{result.method}</span>
                <span className="ds-type-amountlabel" style={{ color: C.secondary }}>{currentCoin.name} 양도차익</span>
              </div>
              <p className="ds-type-amount" style={{ color: amountColor(result.gain) }}>{fmtSigned(result.gain)}원</p>
              <p className="ds-type-note mt-1 tabular-nums" style={{ color: C.secondary }}>
                {fmtKRW(sale)} − {fmtKRW(buy)} − {fmtKRW(exp)}
              </p>
              {result.method === "의제 적용" && (
                <p className="ds-type-assumption mt-2" style={{ color: C.cond }}>취득가액을 확인할 수 없어 양도가액의 50%를 필요경비로 봤습니다. 별도 수수료는 공제하지 않습니다.</p>
              )}
              {result.method === "특례 적용" && (
                <p className="ds-type-assumption mt-2" style={{ color: C.cond }}>실제 취득가와 시행일 0시 시가 중 큰 금액({fmtKRW(buy)}원)을 적용했습니다.</p>
              )}
            </motion.div>
          )}

          {isValid && <div className="mb-5"><PrimaryButton onClick={() => onSave(currentCoinId, result.gain)}>이 코인 저장하고 다음</PrimaryButton></div>}
        </>
      )}

      {savedCoins.length > 0 && (
        <div className="mb-5">
          <p className="ds-type-factlabel mb-2" style={{ color: C.secondary }}>저장된 코인 {savedCoins.length}개</p>
          <div className="app-card" style={{ padding: "4px 16px" }}>
            {savedCoins.map((c) => {
              const chaik = inputs[c.id]?.chaik ?? 0;
              return (
                <div key={c.id} className="app-row" style={{ padding: "10px 0" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span style={{ color: c.dot, fontSize: 10 }}>●</span>
                    <span className="ds-type-factvalue truncate" style={{ color: C.text }}>{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="ds-type-resultrowvalue tabular-nums" style={{ color: amountColor(chaik) }}>{fmtSigned(chaik)}원</span>
                    <button type="button" className="ds-type-detaillink px-1" style={{ color: C.primary }} onClick={() => onChangeCoin(c.id)}>수정</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allSaved && (
        <>
          <div className="text-center py-3 mb-4">
            <CheckCircle2 size={28} className="mx-auto mb-1" style={{ color: C.success }} />
            <p className="ds-type-header" style={{ color: C.text }}>모든 코인 입력 완료</p>
            <p className="ds-type-note" style={{ color: C.secondary }}>세금계산하기를 눌러 결과를 확인하세요</p>
          </div>
          <PrimaryButton onClick={onTaxCalc}>세금계산하기</PrimaryButton>
        </>
      )}

      <p className="ds-type-note mt-4" style={{ color: C.muted }}>· 입력값 기준 참고용 계산 {AS_OF}</p>
    </div>
  );
}

// ── screen 5: tax result ─────────────────────────────────────────────────────

function TaxScreen({ coins, inputs, onSaveResult, onReset, savedAt, canStore }: {
  coins: CoinDisplay[];
  inputs: Record<string, CoinInput>;
  onSaveResult: () => void;
  onReset: () => void;
  savedAt: string | null;
  canStore: boolean;
}) {
  const savedCoins = coins.filter((c) => inputs[c.id]?.chaik !== null && inputs[c.id]?.chaik !== undefined);
  const totalChaik = savedCoins.reduce((s, c) => s + (inputs[c.id].chaik ?? 0), 0);
  const t = calculateTax(totalChaik);
  const [justSaved, setJustSaved] = useState(false);

  const conditions = savedCoins
    .map((c) => ({ name: c.name, method: calculateCoin(inputs[c.id]).method }))
    .filter((x) => x.method !== "실제 취득가 적용");

  const verdictSub = totalChaik <= 0
    ? "총 양도차익이 0원 이하(손실)입니다."
    : t.noTax
      ? `총 양도차익 ${fmtKRW(totalChaik)}원이 기본공제 250만 원 이하입니다.`
      : "총 양도차익이 기본공제 250만 원을 넘습니다.";

  return (
    <div>
      {/* ① 조건 → 판정 → 금액 (같은 영역) */}
      <section className="app-card mb-4" style={{ background: t.noTax ? C.successBg : C.primary }}>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="ds-chip" style={{ background: "rgba(255,255,255,0.85)", color: t.noTax ? C.success : C.primary }}>입력값 기준</span>
          {conditions.map((x) => (
            <span key={x.name} className="ds-chip" style={{ background: "rgba(255,255,255,0.85)", color: C.cond }}>{x.name} {x.method}</span>
          ))}
        </div>
        <p className="ds-type-amountlabel mb-1" style={{ color: t.noTax ? C.success : "rgba(255,255,255,0.8)" }}>2027년 코인 세금 판정</p>
        <p className="ds-type-amount" style={{ color: t.noTax ? C.success : C.white }}>{t.noTax ? "신고·납부 없음" : "신고 대상입니다"}</p>
        <p className="ds-type-explanation mt-1" style={{ color: t.noTax ? C.success : "rgba(255,255,255,0.85)" }}>{verdictSub}</p>
        {!t.noTax && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.25)" }}>
            <p className="ds-type-amountlabel mb-1" style={{ color: "rgba(255,255,255,0.8)" }}>예상 세액 (지방소득세 포함)</p>
            <p className="ds-type-amount" style={{ color: C.white, fontSize: 32 }}>{fmtKRW(t.tax)}원</p>
          </div>
        )}
      </section>

      {/* ② 계산 과정 한 줄 + 기한 */}
      <section className="app-card-outlined mb-4" style={{ padding: 16 }}>
        <p className="ds-type-factlabel mb-1.5" style={{ color: C.muted }}>어떻게 나왔나</p>
        <p className="ds-type-explanation tabular-nums" style={{ color: C.text }}>
          총 양도차익 <b>{fmtSigned(totalChaik)}</b> − 기본공제 <b>{fmtKRW(t.deduction)}</b> = 과세표준 <b style={{ color: C.primary }}>{fmtKRW(t.taxable)}</b>원
          {!t.noTax && <> × 22% = <b style={{ color: C.primary }}>{fmtKRW(t.tax)}</b>원</>}
        </p>
        <p className="ds-type-note mt-1.5" style={{ color: C.secondary }}>
          {t.noTax ? "신고·납부할 세금이 없습니다." : <>신고·납부 기한 <b style={{ color: C.text }}>{TAX_RULES.filingDeadline}</b> (2027년 양도분)</>} {AS_OF}
        </p>
      </section>

      {/* ③ 코인별 */}
      <section className="app-card mb-4" style={{ padding: "12px 16px" }}>
        <p className="ds-type-factlabel mb-1" style={{ color: C.muted }}>코인별 양도차익</p>
        {savedCoins.map((c) => {
          const inp = inputs[c.id];
          const chaik = inp.chaik ?? 0;
          return (
            <div key={c.id} className="app-row" style={{ padding: "10px 0" }}>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span style={{ color: c.dot, fontSize: 10 }}>●</span>
                <span className="ds-type-factvalue" style={{ color: C.text }}>{c.name}</span>
                <span className={methodChipClass(calculateCoin(inp).method)}>{calculateCoin(inp).method}</span>
              </div>
              <span className="ds-type-resultrowvalue tabular-nums flex-shrink-0" style={{ color: amountColor(chaik) }}>{fmtSigned(chaik)}원</span>
            </div>
          );
        })}
      </section>

      {/* ④ 세액 내역 */}
      <section className="app-card mb-4" style={{ padding: "12px 16px" }}>
        {[
          { label: "총 양도차익", value: `${fmtSigned(totalChaik)}원` },
          { label: "기본공제 (−)", value: `${fmtKRW(t.deduction)}원` },
          { label: "과세표준", value: `${fmtKRW(t.taxable)}원`, strong: true },
          { label: "소득세 (20%)", value: `${fmtKRW(t.incomeTax)}원` },
          { label: "지방소득세 (2%)", value: `${fmtKRW(t.localTax)}원` },
          { label: "예상 세액 합계", value: `${fmtKRW(t.tax)}원`, strong: true },
        ].map((row) => (
          <div key={row.label} className="app-row" style={{ padding: "10px 0" }}>
            <span className="ds-type-resultrow" style={{ color: C.secondary }}>{row.label}</span>
            <span className="ds-type-resultrowvalue tabular-nums" style={{ color: row.strong ? C.primary : C.text }}>{row.value}</span>
          </div>
        ))}
      </section>

      {/* ⑤ 고지 */}
      <div className="mb-5">
        <Note tone="warning">
          <span className="ds-type-assumptionstrong block">여기에 나오는 숫자는 입력하신 값으로 계산한 결과입니다. 신고는 실제 거래 기록으로 합니다.</span>
          <span className="block mt-1">개별 세액을 확정하거나 절세를 권유하지 않습니다. {AS_OF}</span>
        </Note>
      </div>

      {/* ⑥ 저장(주요) / 지우기(보조) */}
      <div className="flex gap-2 mb-2">
        <button type="button" className="ds-button flex-1 flex items-center justify-center gap-2" onClick={() => { onSaveResult(); setJustSaved(true); }}>
          <Save size={16} /> {justSaved ? "저장됨" : "이 기기에 저장"}
        </button>
        <button type="button" className="ds-button-secondary flex items-center gap-1.5" onClick={onReset}>
          <Trash2 size={15} /> 입력 지우기
        </button>
      </div>
      <p className="ds-type-note" style={{ color: C.secondary }}>
        {canStore
          ? savedAt
            ? `${fmtDate(savedAt)} 저장됨 · 가격이 바뀌면 홈의 '이어서 보기'에서 다시 열어 수정할 수 있습니다.`
            : "저장하면 이 기기의 브라우저에만 남고 서버로 보내지 않습니다. 가격이 바뀌면 다시 열어 수정할 수 있습니다."
          : "이 브라우저는 저장을 막고 있어 창을 닫으면 입력이 사라집니다."}
      </p>
    </div>
  );
}

// ── bottom tab bar ───────────────────────────────────────────────────────────

function BottomNav({ active, onHome, onInfo, onCalc }: { active: "home" | "info" | "calc"; onHome: () => void; onInfo: () => void; onCalc: () => void }) {
  const tabs = [
    { id: "home" as const, label: "홈", Icon: Home, handler: onHome },
    { id: "info" as const, label: "세금 정보", Icon: BookOpen, handler: onInfo },
    { id: "calc" as const, label: "세금 계산", Icon: Calculator, handler: onCalc },
  ];
  return (
    <nav className="app-tabbar" aria-label="주 메뉴">
      <div className="flex" style={{ height: "var(--ds-ext-tabbar-height)" }}>
        {tabs.map(({ id, label, Icon, handler }) => {
          const isActive = active === id;
          return (
            <button key={id} type="button" onClick={handler} aria-current={isActive ? "page" : undefined} className="flex-1 flex flex-col items-center justify-center gap-1">
              <Icon size={20} style={{ color: isActive ? C.primary : C.muted }} />
              <span className="ds-type-note" style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? C.primary : C.muted }}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [initial] = useState<StoredState>(() => loadState());
  const [canStore] = useState<boolean>(() => storageAvailable());

  const [screen, setScreen] = useState<Screen>("home");
  const [dir, setDir] = useState(1);
  const [lastCalcScreen, setLastCalcScreen] = useState<"tokens" | "calc">("tokens");
  const [detailId, setDetailId] = useState<DetailId>("양도대가");

  const [selectedTokens, setSelectedTokens] = useState<string[]>(initial.selectedTokens);
  const [inputs, setInputs] = useState<Record<string, CoinInput>>(initial.inputs);
  const [savedIds, setSavedIds] = useState<string[]>(initial.savedIds);
  const [currentCoinId, setCurrentCoinId] = useState<string>(initial.selectedTokens.find((id) => !initial.savedIds.includes(id)) ?? initial.selectedTokens[0] ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(initial.savedAt);

  useEffect(() => {
    saveState({ version: 1, selectedTokens, inputs, savedIds, savedAt });
  }, [selectedTokens, inputs, savedIds, savedAt]);

  const coins = useMemo(() => selectedTokens.map(getCoinDisplay), [selectedTokens]);

  const updateInput = (coinId: string, patch: Partial<CoinInput>) =>
    setInputs((prev) => ({ ...prev, [coinId]: { ...(prev[coinId] ?? EMPTY_COIN_INPUT), ...patch } }));

  const go = (to: Screen, d = 1) => {
    setDir(d);
    setScreen(to);
    if (to === "tokens" || to === "calc") setLastCalcScreen(to);
  };

  const saveCoin = (coinId: string, chaik: number) => {
    updateInput(coinId, { chaik });
    const nextSaved = savedIds.includes(coinId) ? savedIds : [...savedIds, coinId];
    setSavedIds(nextSaved);
    const nextPending = selectedTokens.find((id) => !nextSaved.includes(id));
    if (nextPending) setCurrentCoinId(nextPending);
  };

  const editCoin = (coinId: string) => {
    setCurrentCoinId(coinId);
    setSavedIds((prev) => prev.filter((s) => s !== coinId));
    updateInput(coinId, { chaik: null });
  };

  const toggleToken = (id: string) => setSelectedTokens((p) => (p.includes(id) ? p.filter((t) => t !== id) : [...p, id]));

  const startCalc = () => {
    setInputs((prev) => {
      const next: Record<string, CoinInput> = {};
      for (const id of selectedTokens) next[id] = prev[id] ?? EMPTY_COIN_INPUT;
      return next;
    });
    const keptSaved = savedIds.filter((id) => selectedTokens.includes(id));
    setSavedIds(keptSaved);
    setCurrentCoinId(selectedTokens.find((id) => !keptSaved.includes(id)) ?? selectedTokens[0] ?? "");
    go("calc");
  };

  const resetAll = () => {
    if (!window.confirm("저장된 입력값과 결과를 모두 지울까요?")) return;
    clearState();
    setSelectedTokens([]);
    setInputs({});
    setSavedIds([]);
    setCurrentCoinId("");
    setSavedAt(null);
    go("home", -1);
  };

  const activeTab: "home" | "info" | "calc" =
    screen === "info" || screen === "detail" ? "info" : screen === "tokens" || screen === "calc" || screen === "tax" ? "calc" : "home";

  const headers: Record<Screen, { title: string; onBack?: () => void; step?: number }> = {
    home: { title: "cointax 세금도우미" },
    info: { title: "세금 정보", onBack: () => go("home", -1) },
    detail: { title: "세금 정보", onBack: () => go("info", -1) },
    tokens: { title: "세금 계산", onBack: () => go("home", -1), step: 1 },
    calc: { title: "세금 계산", onBack: () => go("tokens", -1), step: 2 },
    tax: { title: "세금 계산 결과", onBack: () => go("calc", -1), step: 3 },
  };

  const screens: Record<Screen, JSX.Element> = {
    home: (
      <HomeScreen
        onInfo={() => go("info")}
        onCalc={() => go("tokens")}
        saved={savedIds.length > 0 ? { count: savedIds.length, savedAt } : null}
        onResume={() => go(savedIds.length === selectedTokens.length ? "tax" : "calc")}
        onReset={resetAll}
      />
    ),
    info: <InfoScreen onSelect={(id) => { setDetailId(id); go("detail"); }} />,
    detail: <DetailScreen id={detailId} />,
    tokens: <TokensScreen selected={selectedTokens} onToggle={toggleToken} onNext={startCalc} />,
    calc: (
      <CalcScreen coins={coins} inputs={inputs} onUpdate={updateInput} savedIds={savedIds} currentCoinId={currentCoinId}
        onSave={saveCoin} onChangeCoin={editCoin} onTaxCalc={() => go("tax")} />
    ),
    tax: (
      <TaxScreen coins={coins} inputs={inputs} onSaveResult={() => setSavedAt(new Date().toISOString())} onReset={resetAll} savedAt={savedAt} canStore={canStore} />
    ),
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
        <Header {...headers[screen]} />
        <motion.main key={screen} initial={{ opacity: 0, x: dir * 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }} className="app-main">
          {screens[screen]}
        </motion.main>
        <BottomNav active={activeTab} onHome={() => go("home", -1)} onInfo={() => go("info", screen === "tokens" || screen === "calc" ? -1 : 1)} onCalc={() => go(lastCalcScreen)} />
      </div>
    </div>
  );
}
