import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ArrowRight, BookOpen, Calculator, Home, CheckCircle, Save, Trash2, RotateCcw } from "lucide-react";
import coinTaxLogo from "@/assets/coin_tax.png";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Label } from "@/app/components/ui/label";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/app/components/ui/accordion";
import { calculateCoin, calculateTax, EMPTY_COIN_INPUT, TAX_RULES, type CoinInput } from "./tax";
import { clearState, loadState, saveState, storageAvailable, type StoredState } from "./storage";

// ── constants ──────────────────────────────────────────────────────────────

type Screen = "home" | "info" | "detail" | "tokens" | "calc" | "tax";

type DetailId = "양도대가" | "취득가액" | "부대비용";

const AS_OF = `(${TAX_RULES.asOf})`;

const DETAIL_CONTENT: Record<DetailId, { title: string; summary: string; sections: { heading: string; body: string }[] }> = {
  양도대가: {
    title: "가상자산의 양도대가",
    summary: "가상자산 종류별로 한 해 동안 받은 총 양도대가를 말합니다.",
    sections: [
      {
        heading: "양도대가란?",
        body: "가상자산을 양도·대여하고 그 대가로 받는 금액 전체입니다. 현금 외에 다른 가상자산이나 재산적 가치가 있는 모든 것을 포함합니다.",
      },
      {
        heading: "현금 등을 받은 경우",
        body: "받은 원화(외화는 환산) 금액 전액이 양도대가입니다.",
      },
      {
        heading: "코인끼리 교환한 경우",
        body: "교환도 양도에 해당합니다. 기축가상자산(BTC마켓의 비트코인, USDT마켓의 테더 등)의 가액에 대상 가상자산의 교환비율을 적용해 계산합니다.",
      },
    ],
  },
  취득가액: {
    title: "가상자산의 취득가액",
    summary: "가상자산을 취득할 때 실제로 지출한 금액으로, 가상자산 종류별로 총평균법으로 계산합니다.",
    sections: [
      {
        heading: "취득가액이란?",
        body: "가상자산의 매입가액과 취득 시 발생한 수수료 등 부대비용을 말합니다.",
      },
      {
        heading: "총평균법이란?",
        body: "양도한 가상자산을 여러 번에 나눠 취득했다면, 해당 가상자산의 총 취득가액을 총 취득수량으로 나누어 1개당 평균 취득가액을 계산합니다.",
      },
      {
        heading: "시행 전 보유분 취득가액 특례 (소득세법 제37조제5항)",
        body: `${TAX_RULES.effectiveDate} 전부터 보유한 가상자산은 실제 취득가액과 시행일 0시 시가 중 큰 금액을 취득가액으로 합니다. 취득가액이 확정되는 시점이 ${TAX_RULES.effectiveDate}이므로, 그 전에 실제 취득가를 정리해 두는 것이 좋습니다.`,
      },
      {
        heading: "취득가액 확인이 곤란할 때 (필요경비 50% 의제)",
        body: "실제 취득가액을 확인할 수 없으면 동종 가상자산 전체에 대해 양도가액의 50%를 필요경비로 의제할 수 있습니다. 이 경우 별도의 부대비용은 인정하지 않습니다.",
      },
    ],
  },
  부대비용: {
    title: "부대비용 (필요경비)",
    summary: "가상자산 거래 과정에서 실제로 지출한 수수료 등입니다. 취득 수수료는 취득가액에, 양도 수수료는 부대비용에 들어가지만 결과적으로 모두 양도차익을 줄입니다.",
    sections: [
      {
        heading: "부대비용이란?",
        body: "가상자산의 취득·양도와 직접 관련해 지출한 비용입니다.",
      },
      {
        heading: "공제 가능한 비용",
        body: "거래소 매수·매도 수수료, 출금 수수료, 네트워크 이용료(가스비) 등 실제 지출이 확인되는 비용입니다.",
      },
      {
        heading: "공제 불가 비용",
        body: "단순 지갑 이전 수수료 등 양도·대여와 직접 관련 없는 비용은 공제되지 않습니다.",
      },
      {
        heading: "증빙 필수",
        body: "거래소 수수료 내역, 블록체인 트랜잭션 기록 등 지출을 증명할 수 있는 자료가 있어야 인정됩니다.",
      },
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

const BLUE = "var(--primary)";
const BLUE_LIGHT = "var(--secondary)";
const DARK_BLUE = "var(--chart-3)";
const RED = "#D4183D";

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
    return { id, name, symbol: name, dot: "#888888" };
  }
  return ALL_COINS.find((c) => c.id === id) ?? { id, name: id, symbol: id, dot: "#888888" };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtKRW(n: number) {
  return n.toLocaleString("ko-KR");
}
function fmtSigned(n: number) {
  return `${n < 0 ? "−" : ""}${fmtKRW(Math.abs(n))}`;
}
function parseKRW(s: string) {
  return parseInt(s.replace(/\D/g, ""), 10) || 0;
}
function fmtInput(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 15);
  return d ? parseInt(d, 10).toLocaleString("ko-KR") : "";
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// ── shared ui ───────────────────────────────────────────────────────────────

function NavBar({ title, onBack, step }: { title: string; onBack?: () => void; step?: number }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="뒤로"
          className="w-9 h-9 rounded-xl flex items-center justify-center -ml-2 hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={20} color="#555" />
        </button>
      )}
      <span className="text-[13px] font-bold" style={{ color: BLUE }}>
        {title}
      </span>
      {step !== undefined && (
        <>
          <div className="flex-1" />
          <div className="flex gap-1" aria-label={`${step} / 3 단계`}>
            {[1, 2, 3].map((s) => (
              <div key={s} className="h-1.5 w-5 rounded-full transition-colors" style={{ background: s <= step ? BLUE : "#E4E8EF" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 text-[12.5px] leading-relaxed text-gray-600" style={{ background: "#F6F7FA" }}>
      {children}
    </div>
  );
}

// ── screen 1: home ──────────────────────────────────────────────────────────

function HomeScreen({
  onInfo, onCalc, saved, onResume, onReset,
}: {
  onInfo: () => void;
  onCalc: () => void;
  saved: { count: number; savedAt: string | null } | null;
  onResume: () => void;
  onReset: () => void;
}) {
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2.5 mb-7">
        <img src={coinTaxLogo} alt="cointax 로고" className="w-9 h-9 object-contain" />
        <span className="text-[13px] font-bold" style={{ color: BLUE }}>
          cointax 세금도우미
        </span>
      </div>

      <h1 className="text-[25px] font-black leading-[1.3] text-gray-900 mb-3" style={{ letterSpacing: "-0.02em" }}>
        코인 세금, 나도 내야 하나?
        <br />
        3분이면 압니다.
      </h1>
      <p className="text-[13.5px] text-gray-500 leading-relaxed mb-7">
        세무사가 설계하고 검수한 안내와 계산.
        <br />
        질문 몇 개로 내가 내는 사람인지부터 확인합니다.
      </p>

      {saved && saved.count > 0 && (
        <div className="rounded-2xl border px-4 py-3.5 mb-4" style={{ borderColor: BLUE, background: BLUE_LIGHT }}>
          <p className="text-[12px] font-bold mb-1" style={{ color: BLUE }}>
            이 기기에 저장된 계산 · 코인 {saved.count}개
            {saved.savedAt && <span className="font-normal text-gray-500"> · {fmtDate(saved.savedAt)}</span>}
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={onResume} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: BLUE }}>
              이어서 보기
            </button>
            <button onClick={onReset} className="px-3.5 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 flex items-center gap-1">
              <RotateCcw size={14} /> 새로
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-7">
        <button
          onClick={onCalc}
          className="w-full flex items-center justify-between px-5 py-[18px] rounded-2xl font-bold text-[15px] transition-all active:scale-[0.98]"
          style={{ background: BLUE, color: "#fff" }}
        >
          <span className="flex items-center gap-2">
            <Calculator className="size-4" /> 세금 계산
          </span>
          <ArrowRight size={17} />
        </button>
        <button
          onClick={onInfo}
          className="w-full flex items-center justify-between px-5 py-[18px] rounded-2xl font-bold text-[15px] transition-all active:scale-[0.98]"
          style={{ background: BLUE_LIGHT, color: BLUE }}
        >
          <span className="flex items-center gap-2">
            <BookOpen className="size-4" /> 세금 정보
          </span>
          <ArrowRight size={17} />
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden border border-gray-100 mb-5">
        <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
          2027년 핵심 요약 <span className="normal-case tracking-normal font-normal">{AS_OF}</span>
        </div>
        {[
          { label: "과세 기준", value: "기타소득세 22% (지방소득세 포함)" },
          { label: "기본공제", value: "연 250만 원" },
          { label: "취득가액 확정", value: `${TAX_RULES.effectiveDate} 0시 시가` },
          { label: "신고·납부 기한", value: TAX_RULES.filingDeadline },
        ].map((row, i) => (
          <div key={row.label} className="flex justify-between items-center gap-3 px-4 py-3 border-t border-gray-100">
            <span className="text-[13px] text-gray-500 flex-shrink-0">{row.label}</span>
            <span className="text-[13px] font-semibold text-right" style={{ color: i === 0 ? BLUE : "#111" }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <Notice>
        · 거래내역 파일 업로드·지갑 연결 없음. 직접 입력합니다.
        <br />· 입력값은 이 기기의 브라우저에만 저장되고 서버로 보내지 않습니다.
        <br />· 계산 결과는 입력값 기준 참고용이며 개별 세액을 확정하지 않습니다.
      </Notice>
      <p className="text-[12px] text-gray-400 mt-3">세무법인케이앤피 · 문의 litt.ly/cointax</p>
    </div>
  );
}

// ── screen 2: info ──────────────────────────────────────────────────────────

function DetailScreen({ id, onBack }: { id: DetailId; onBack: () => void }) {
  const content = DETAIL_CONTENT[id];
  return (
    <div className="pt-1">
      <NavBar title="세금 정보" onBack={onBack} />
      <div className="inline-block text-[11.5px] font-bold px-2.5 py-1 rounded-full mb-3" style={{ background: BLUE_LIGHT, color: BLUE }}>
        {id}
      </div>
      <h2 className="text-[19px] font-black text-gray-900 mb-2 leading-snug" style={{ letterSpacing: "-0.01em" }}>
        {content.title}
      </h2>
      <p className="text-[13px] text-gray-500 leading-relaxed mb-5">{content.summary}</p>
      <div className="space-y-3">
        {content.sections.map((sec, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
            <p className="text-[13px] font-bold text-gray-800 mb-1.5 flex items-start gap-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10.5px] font-black text-white mt-0.5" style={{ background: BLUE }}>
                {i + 1}
              </span>
              <span>{sec.heading}</span>
            </p>
            <p className="text-[13px] text-gray-600 leading-relaxed pl-7">{sec.body}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-gray-400 mt-4">{AS_OF} · 법령이 바뀌면 앱 안 안내로 알려드립니다.</p>
    </div>
  );
}

function InfoScreen({ onBack, onSelect }: { onBack: () => void; onSelect: (id: DetailId) => void }) {
  const INFO: { id: DetailId; label: string; desc: string }[] = [
    { id: "양도대가", label: "양도대가", desc: "양도·대여로 받는 경제적 대가 전체" },
    { id: "취득가액", label: "취득가액", desc: "매입가액과 취득 수수료 / 시행 전 보유분 특례 · 50% 의제" },
    { id: "부대비용", label: "부대비용", desc: "양도 수수료 등 필요경비" },
  ];

  return (
    <div className="pt-1">
      <NavBar title="세금 정보" onBack={onBack} />

      <h2 className="text-[19px] font-black text-gray-900 mb-1" style={{ letterSpacing: "-0.01em" }}>
        가상자산 세금이란?
      </h2>
      <p className="text-[13px] text-gray-500 mb-4 leading-relaxed">
        가상자산의 양도대가에서 취득가액과 부대비용을 빼 기타소득금액을 구합니다. 여기서 기본공제 250만 원을 뺀 과세표준에 22%(소득세 20% + 지방소득세 2%)를 적용합니다. {AS_OF}
      </p>

      <div className="space-y-2 mb-5">
        {INFO.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="w-full flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3.5 hover:border-blue-300 hover:bg-blue-50/40 transition-all text-left active:scale-[0.98]"
          >
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: BLUE_LIGHT }}>
              <div className="w-2 h-2 rounded-full" style={{ background: BLUE }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-gray-800">{item.label}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">{item.desc}</p>
            </div>
            <ChevronLeft size={15} color="#CCCCCC" className="flex-shrink-0 mt-0.5 rotate-180" />
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-muted p-4">
        <div className="text-[15px] font-semibold text-foreground mb-1">자주 묻는 질문</div>
        <p className="text-[12px] text-gray-500 mb-2">세무사가 미리 정리한 답변입니다. 개별 상담은 제공하지 않습니다.</p>
        <Accordion type="single" collapsible>
          {FAQ.map(([question, answer], i) => (
            <AccordionItem key={question} value={String(i)}>
              <AccordionTrigger className="text-[13.5px] text-left">{question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed text-[13px]">{answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}

// ── screen 3: coin selection ─────────────────────────────────────────────────

const CheckMark = () => (
  <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden>
    <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function TokenTile({ name, symbol, dot, on, onClick, small = false }: { name: string; symbol: string; dot: string; on: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="relative flex flex-col items-center rounded-2xl border-2 transition-all active:scale-[0.97] font-bold"
      style={{
        borderColor: on ? BLUE : "#E4E8EF",
        background: on ? BLUE_LIGHT : "#fff",
        color: on ? BLUE : "#333",
        paddingTop: small ? 12 : 18,
        paddingBottom: small ? 12 : 18,
        fontSize: small ? 12.5 : 14,
      }}
    >
      {on && (
        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: BLUE }}>
          <CheckMark />
        </span>
      )}
      <span style={{ color: dot, fontSize: small ? 9 : 11, marginBottom: small ? 4 : 6 }}>●</span>
      {name}
      <span style={{ fontSize: small ? 10 : 11, fontWeight: 400, marginTop: 2, color: on ? "#4F74D9" : "#888" }}>{symbol}</span>
    </button>
  );
}

function TokensScreen({ onBack, selected, onToggle, onNext }: { onBack: () => void; selected: string[]; onToggle: (id: string) => void; onNext: () => void }) {
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
    <div className="pt-1">
      <NavBar title="세금 계산" onBack={onBack} step={1} />

      <h2 className="text-[20px] font-black text-gray-900 mb-1 leading-snug" style={{ letterSpacing: "-0.01em" }}>
        2027년에 판 코인을
        <br />
        선택하세요
      </h2>
      <p className="text-[13px] text-gray-500 mb-4">여러 개를 고를 수 있어요. 팔지 않은 코인은 세금이 없습니다.</p>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {TOKENS.map((t) => (
          <TokenTile key={t.id} {...t} on={selected.includes(t.id)} onClick={() => onToggle(t.id)} />
        ))}
      </div>

      <button
        onClick={() => setShowList((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all mb-2"
        style={{ borderColor: showList ? BLUE : "#E4E8EF", background: showList ? BLUE_LIGHT : "#F8F9FB" }}
      >
        <span className="text-[13.5px] font-semibold" style={{ color: showList ? BLUE : "#555" }}>
          기타 코인 직접 선택
        </span>
        <ChevronLeft size={16} color={showList ? BLUE : "#AAA"} style={{ transform: showList ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.2s" }} />
      </button>

      {showList && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="border border-gray-100 rounded-2xl p-3 mb-3" style={{ background: "#FAFBFC" }}>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">국내 거래소 상장 코인</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {LISTED_COINS.map((t) => (
              <TokenTile key={t.id} {...t} on={selected.includes(t.id)} onClick={() => onToggle(t.id)} small />
            ))}
          </div>

          {!showCustom ? (
            <button onClick={() => setShowCustom(true)} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 hover:border-blue-300 transition-colors">
              <span className="text-[15px] font-bold" style={{ color: BLUE }}>+</span>
              <span className="text-[13px] text-gray-500">직접 입력 (상장폐지·해외 코인)</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                placeholder="코인명 또는 심볼 입력"
                className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] outline-none bg-white"
                style={{ borderColor: customInput ? BLUE : undefined }}
              />
              <button onClick={addCustom} className="px-4 py-2.5 rounded-xl font-bold text-[13px] text-white transition-all active:scale-95" style={{ background: BLUE }}>
                추가
              </button>
            </div>
          )}
        </motion.div>
      )}

      {selected.length > 0 && (
        <div className="mb-4">
          <p className="text-[12px] font-semibold text-gray-500 mb-2">
            선택한 코인 <span style={{ color: BLUE }}>{selected.length}</span>개
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((id) => {
              const c = getCoinDisplay(id);
              return (
                <div key={id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full text-[12.5px] font-semibold" style={{ background: BLUE_LIGHT, color: BLUE }}>
                  <span style={{ color: c.dot, fontSize: 8 }}>●</span>
                  {c.name}
                  <button onClick={() => onToggle(id)} aria-label={`${c.name} 선택 해제`} className="w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors hover:bg-blue-200" style={{ color: BLUE }}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={selected.length === 0}
        className="w-full py-[17px] rounded-2xl font-bold text-[15px] transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: BLUE, color: "#fff" }}
      >
        선택완료
      </button>
      <p className="text-[12.5px] text-gray-500 mt-3">· 선택 내역과 입력값은 이 기기에만 저장됩니다.</p>
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
      <Label htmlFor={id} className="text-[13px] text-gray-700 font-semibold block mb-1">{label}</Label>
      {hint && <p className="text-[12px] text-gray-500 mb-2">{hint}</p>}
      <div className={`flex items-center rounded-xl border px-4 py-3 bg-card transition-colors ${error ? "border-destructive" : "border-border"}`}>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          onChange={(e) => { if (/^[0-9,]*$/.test(e.target.value)) onChange(fmtInput(e.target.value)); }}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          className="flex-1 min-w-0 text-[16px] font-semibold text-foreground border-0 bg-transparent px-0 placeholder:text-muted-foreground placeholder:text-[13px] placeholder:font-normal focus-visible:ring-0"
        />
        <span className="text-sm text-muted-foreground ml-2 flex-shrink-0">원</span>
      </div>
      {error && <div className="text-[12px] mt-1 ml-1 text-destructive" role="alert">{error}</div>}
    </div>
  );
}

function CalcScreen({
  onBack, coins, inputs, onUpdate, savedIds, currentCoinId, onSave, onChangeCoin, onTaxCalc,
}: {
  onBack: () => void;
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

  const touch = (field: string) =>
    setTouched((prev) => ({ ...prev, [currentCoinId]: new Set([...(prev[currentCoinId] ?? []), field]) }));
  const isTouched = (field: string) => touched[currentCoinId]?.has(field) ?? false;

  const result = calculateCoin(inp);
  const { sale, acquisition: buy, expenses: exp } = result;
  const isValid = result.valid;
  const saleError = isTouched("sale") && (!Number.isSafeInteger(sale) || sale <= 0) ? "판 금액을 원 단위 숫자로 입력해 주세요" : undefined;
  const buyError = isTouched("buy") && inp.buyAmt !== "" && parseKRW(inp.buyAmt) <= 0 ? "숫자를 입력하거나 비워 주세요" : undefined;

  return (
    <div className="pt-1">
      <NavBar title="세금 계산" onBack={onBack} step={2} />

      {!allSaved && (
        <div className="mb-4">
          <p className="text-[12px] font-bold text-gray-500 mb-2">
            입력 대기 <span style={{ color: BLUE }}>{pendingCoins.length}</span>개
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pendingCoins.map((c) => {
              const isCurrent = c.id === currentCoinId;
              return (
                <button key={c.id} onClick={() => onChangeCoin(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-all" style={{ background: isCurrent ? BLUE : "#F0F2F5", color: isCurrent ? "#fff" : "#555" }}>
                  <span style={{ color: isCurrent ? "rgba(255,255,255,0.65)" : c.dot, fontSize: 8 }}>●</span>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!allSaved && currentCoin && (
        <>
          <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-2xl" style={{ background: BLUE_LIGHT }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white shadow-sm flex-shrink-0">
              <span style={{ color: currentCoin.dot, fontSize: 18 }}>●</span>
            </div>
            <p className="text-[16px] font-black" style={{ color: DARK_BLUE, letterSpacing: "-0.01em" }}>
              {currentCoin.name}
              <span className="text-[12px] font-semibold ml-1.5" style={{ color: "#4F74D9" }}>{currentCoin.symbol}</span>
            </p>
          </div>

          <div className="space-y-4 mb-3">
            {/* 질문 1 — 분기 질문 */}
            <div className="rounded-xl border border-border bg-muted p-4 space-y-3">
              <div className="text-[13.5px] font-semibold text-foreground">① 이 코인, {TAX_RULES.effectiveDate} 전부터 갖고 계셨나요?</div>
              <div className="flex gap-2">
                {[true, false].map((old) => (
                  <Button key={String(old)} variant={inp.isOld === old ? "default" : "outline"} className="flex-1 h-10 text-[14px]" aria-pressed={inp.isOld === old} onClick={() => onUpdate(currentCoinId, { isOld: old })}>
                    {old ? "예, 그 전부터" : "아니요, 2027년 이후"}
                  </Button>
                ))}
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                {inp.isOld
                  ? `실제 취득가와 시행일 0시 시가 중 큰 금액이 취득가액이 됩니다(소득세법 §37⑤).`
                  : "2027년 이후 산 코인은 실제 취득가가 취득가액입니다. 모르면 양도가액의 50%를 필요경비로 봅니다."}
              </p>
            </div>

            {/* 질문 2 — 판 금액 */}
            <AmtInput id={`${currentCoinId}-sale`} label="② 2027년에 판 금액 (양도가액)" hint="이 코인을 판 금액의 합계. 다른 코인으로 바꾼 것도 포함"
              value={inp.saleAmt} error={saleError} onBlur={() => touch("sale")} onChange={(v) => onUpdate(currentCoinId, { saleAmt: v })} />

            {/* 질문 3 — 산 금액 */}
            <AmtInput id={`${currentCoinId}-buy`} label="③ 산 금액 (실제 취득가액)" hint="판 수량에 해당하는 매입 금액. 정확히 몰라도 대략의 값으로 시작할 수 있어요"
              placeholder="확인할 수 없으면 비워 주세요" value={inp.buyAmt} error={buyError} onBlur={() => touch("buy")} onChange={(v) => onUpdate(currentCoinId, { buyAmt: v })} />

            {inp.isOld && (
              <AmtInput id={`${currentCoinId}-market`} label={`${TAX_RULES.effectiveDate} 0시 시가`} hint="판 수량 × 시행일 0시 가격. 모르면 비워 두세요"
                placeholder="시가를 모르면 비워 주세요" value={inp.marketAmt} onChange={(v) => onUpdate(currentCoinId, { marketAmt: v })} />
            )}

            <AmtInput id={`${currentCoinId}-exp`} label="수수료 등 필요경비 (선택)" placeholder="없으면 0원으로 처리"
              value={inp.expenses} onChange={(v) => onUpdate(currentCoinId, { expenses: v })} />
          </div>

          {isValid && (
            <motion.div key={`${currentCoinId}-result`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="rounded-2xl p-4 mb-3 border-2" style={{ borderColor: BLUE, background: BLUE_LIGHT }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[12px] font-semibold" style={{ color: "#4F74D9" }}>{currentCoin.name} 양도차익</p>
                <Badge variant={result.method === "의제 적용" ? "outline" : "secondary"} className="bg-white">{result.method}</Badge>
              </div>
              <p className="text-[26px] font-black leading-none mb-1.5" style={{ color: result.gain < 0 ? RED : BLUE, letterSpacing: "-0.02em" }}>
                {fmtSigned(result.gain)}원
              </p>
              <p className="text-[12px]" style={{ color: "#4F74D9" }}>
                {fmtKRW(sale)} − {fmtKRW(buy)} − {fmtKRW(exp)}
              </p>
              {result.method === "의제 적용" && (
                <p className="text-[12px] text-gray-600 mt-2">취득가액을 확인할 수 없어 양도가액의 50%를 필요경비로 봤습니다. 이 경우 별도 수수료는 공제하지 않습니다.</p>
              )}
              {result.method === "특례 적용" && (
                <p className="text-[12px] text-gray-600 mt-2">실제 취득가와 시행일 0시 시가 중 큰 금액({fmtKRW(buy)}원)을 적용했습니다.</p>
              )}
            </motion.div>
          )}

          {isValid && (
            <button onClick={() => onSave(currentCoinId, result.gain)} className="w-full py-4 rounded-2xl font-bold text-[15px] mb-4 transition-all active:scale-[0.98]" style={{ background: BLUE, color: "#fff" }}>
              이 코인 저장하고 다음
            </button>
          )}
        </>
      )}

      {savedCoins.length > 0 && (
        <div className="mb-4">
          <p className="text-[12px] font-bold text-gray-500 mb-2">저장된 코인 {savedCoins.length}개</p>
          <div className="space-y-1.5">
            {savedCoins.map((c) => {
              const saved = inputs[c.id];
              const chaik = saved?.chaik ?? 0;
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span style={{ color: c.dot, fontSize: 10 }}>●</span>
                    <span className="text-[13.5px] font-semibold text-gray-800 truncate">{c.name}</span>
                  </div>
                  <span className="text-[13.5px] font-bold tabular-nums flex-shrink-0" style={{ color: chaik > 0 ? BLUE : chaik < 0 ? RED : "#888" }}>
                    {fmtSigned(chaik)}원
                  </span>
                  <Button variant="ghost" size="sm" className="text-[12.5px] h-8 px-2 flex-shrink-0" onClick={() => onChangeCoin(c.id)}>수정</Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allSaved && (
        <>
          <div className="text-center py-4 mb-3">
            <CheckCircle className="size-7 text-primary mx-auto mb-1" />
            <p className="text-[14.5px] font-black text-gray-900 mb-0.5">모든 코인 입력 완료</p>
            <p className="text-[12.5px] text-gray-500">세금계산하기를 눌러 결과를 확인하세요</p>
          </div>
          <button onClick={onTaxCalc} className="w-full py-4 rounded-2xl font-bold text-[15px] transition-all active:scale-[0.98]" style={{ background: DARK_BLUE, color: "#fff" }}>
            세금계산하기 →
          </button>
        </>
      )}

      <p className="text-[12.5px] text-gray-500 mt-4">· 입력값 기준 참고용 계산 {AS_OF}</p>
    </div>
  );
}

// ── screen 5: tax result ─────────────────────────────────────────────────────

function TaxScreen({
  coins, inputs, onBack, onSaveResult, onReset, savedAt, canStore,
}: {
  coins: CoinDisplay[];
  inputs: Record<string, CoinInput>;
  onBack: () => void;
  onSaveResult: () => void;
  onReset: () => void;
  savedAt: string | null;
  canStore: boolean;
}) {
  const savedCoins = coins.filter((c) => inputs[c.id]?.chaik !== null && inputs[c.id]?.chaik !== undefined);
  const totalChaik = savedCoins.reduce((s, c) => s + (inputs[c.id].chaik ?? 0), 0);
  const t = calculateTax(totalChaik);
  const [justSaved, setJustSaved] = useState(false);

  const verdictSub = totalChaik <= 0
    ? "총 양도차익이 0원 이하(손실)입니다."
    : t.noTax
      ? `총 양도차익 ${fmtKRW(totalChaik)}원이 기본공제 250만 원 이하입니다.`
      : "총 양도차익이 기본공제 250만 원을 넘습니다.";

  return (
    <div className="pt-1">
      <NavBar title="세금 계산" onBack={onBack} step={3} />

      {/* ① 판정 — 내가 내는 사람인지부터 */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: t.noTax ? "#EEF9F1" : DARK_BLUE }}>
        <p className="text-[12px] font-semibold mb-1.5" style={{ color: t.noTax ? "#2E7D4F" : "#A9BFF5" }}>2027년 코인 세금 · 입력값 기준 판정</p>
        <p className="text-[26px] font-black leading-tight mb-1.5" style={{ color: t.noTax ? "#1E6B3F" : "#fff", letterSpacing: "-0.02em" }}>
          {t.noTax ? "신고·납부 없음" : "신고 대상입니다"}
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: t.noTax ? "#2E7D4F" : "#C9D6F7" }}>{verdictSub}</p>
        {!t.noTax && (
          <>
            <p className="text-[12px] mt-4 mb-0.5" style={{ color: "#A9BFF5" }}>예상 세액 (지방소득세 포함)</p>
            <p className="text-[30px] font-black text-white leading-none" style={{ letterSpacing: "-0.02em" }}>{fmtKRW(t.tax)}원</p>
          </>
        )}
      </div>

      {/* ② 계산 과정 한 줄 + 기한 */}
      <div className="rounded-2xl border border-gray-200 px-4 py-3.5 mb-4 space-y-2">
        <p className="text-[12px] font-bold text-gray-500">어떻게 나왔나</p>
        <p className="text-[13px] text-gray-800 leading-relaxed tabular-nums">
          총 양도차익 <b>{fmtSigned(totalChaik)}</b> − 기본공제 <b>{fmtKRW(t.deduction)}</b> = 과세표준 <b style={{ color: BLUE }}>{fmtKRW(t.taxable)}</b>원
          {!t.noTax && <> × 22% = <b style={{ color: BLUE }}>{fmtKRW(t.tax)}</b>원</>}
        </p>
        <p className="text-[12.5px] text-gray-600">
          {t.noTax ? "신고·납부할 세금이 없습니다." : <>신고·납부 기한 <b>{TAX_RULES.filingDeadline}</b> (2027년 양도분)</>} {AS_OF}
        </p>
      </div>

      {/* ③ 코인별 */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden mb-4">
        <div className="bg-gray-50 px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">코인별 양도차익</div>
        {savedCoins.map((c) => {
          const inp = inputs[c.id];
          const chaik = inp.chaik ?? 0;
          return (
            <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span style={{ color: c.dot, fontSize: 10 }}>●</span>
                <span className="text-[13.5px] font-semibold text-gray-800">{c.name}</span>
                <Badge variant="secondary" className="text-[11px]">{calculateCoin(inp).method}</Badge>
              </div>
              <span className="text-[13.5px] font-bold tabular-nums flex-shrink-0" style={{ color: chaik > 0 ? BLUE : chaik < 0 ? RED : "#888" }}>
                {fmtSigned(chaik)}원
              </span>
            </div>
          );
        })}
      </div>

      {/* ④ 세액 내역 */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden mb-4">
        {[
          { label: "총 양도차익", value: `${fmtSigned(totalChaik)}원` },
          { label: "기본공제 (−)", value: `${fmtKRW(t.deduction)}원` },
          { label: "과세표준", value: `${fmtKRW(t.taxable)}원` },
          { label: "소득세 (20%)", value: `${fmtKRW(t.incomeTax)}원` },
          { label: "지방소득세 (2%)", value: `${fmtKRW(t.localTax)}원` },
          { label: "예상 세액 합계", value: `${fmtKRW(t.tax)}원` },
        ].map((row, i) => (
          <div key={row.label} className="flex justify-between items-center px-4 py-3 border-b border-gray-100 last:border-0" style={{ background: i === 5 ? "#F8F9FB" : undefined }}>
            <span className="text-[13px] text-gray-600">{row.label}</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: i === 2 || i === 5 ? BLUE : "#333" }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* ⑤ 고지 */}
      <div className="rounded-xl px-4 py-3.5 mb-4 border" style={{ borderColor: "#F3D9A4", background: "#FFF9EC" }}>
        <p className="text-[13px] text-gray-800 leading-relaxed font-semibold">여기에 나오는 숫자는 입력하신 값으로 계산한 결과입니다. 신고는 실제 거래 기록으로 합니다.</p>
        <p className="text-[12px] text-gray-600 mt-1">개별 세액을 확정하거나 절세를 권유하지 않습니다. {AS_OF}</p>
      </div>

      {/* ⑥ 저장 / 지우기 */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => { onSaveResult(); setJustSaved(true); }}
          className="flex-1 py-3.5 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{ background: BLUE, color: "#fff" }}
        >
          <Save size={16} /> {justSaved ? "저장됨" : "이 기기에 저장"}
        </button>
        <button onClick={onReset} className="px-4 py-3.5 rounded-2xl font-semibold text-[14px] text-gray-600 border border-gray-200 flex items-center gap-1.5 transition-all active:scale-[0.98]">
          <Trash2 size={15} /> 입력 지우기
        </button>
      </div>
      <p className="text-[12px] text-gray-500 leading-relaxed">
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
  const allTabs = [
    { id: "home" as const, label: "홈", Icon: Home, handler: onHome },
    { id: "info" as const, label: "세금 정보", Icon: BookOpen, handler: onInfo },
    { id: "calc" as const, label: "세금 계산", Icon: Calculator, handler: onCalc },
  ];
  return (
    <nav className="flex-shrink-0 bg-white border-t border-gray-100" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
      <div className="flex">
        {allTabs.map(({ id, label, Icon, handler }) => {
          const isActive = active === id;
          return (
            <button key={id} onClick={handler} aria-current={isActive ? "page" : undefined} className="flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1 transition-colors">
              <div className="w-11 h-7 rounded-xl flex items-center justify-center transition-colors" style={{ background: isActive ? BLUE_LIGHT : "transparent" }}>
                <Icon size={18} color={isActive ? BLUE : "#9A9A9A"} />
              </div>
              <span className="text-[11.5px] font-semibold transition-colors" style={{ color: isActive ? BLUE : "#8A8A8A" }}>{label}</span>
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
  const [currentCoinId, setCurrentCoinId] = useState<string>(
    initial.selectedTokens.find((id) => !initial.savedIds.includes(id)) ?? initial.selectedTokens[0] ?? "",
  );
  const [savedAt, setSavedAt] = useState<string | null>(initial.savedAt);

  // 자동 저장(초안) — 입력 중 새로고침해도 유지. 서버 전송 없음.
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
    window.scrollTo?.(0, 0);
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

  const toggleToken = (id: string) =>
    setSelectedTokens((p) => (p.includes(id) ? p.filter((t) => t !== id) : [...p, id]));

  const startCalc = () => {
    // 이미 입력한 코인은 유지, 새 코인만 추가, 해제한 코인은 제거
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
    info: <InfoScreen onBack={() => go("home", -1)} onSelect={(id) => { setDetailId(id); go("detail"); }} />,
    detail: <DetailScreen id={detailId} onBack={() => go("info", -1)} />,
    tokens: <TokensScreen onBack={() => go("home", -1)} selected={selectedTokens} onToggle={toggleToken} onNext={startCalc} />,
    calc: (
      <CalcScreen
        onBack={() => go("tokens", -1)}
        coins={coins}
        inputs={inputs}
        onUpdate={updateInput}
        savedIds={savedIds}
        currentCoinId={currentCoinId}
        onSave={saveCoin}
        onChangeCoin={editCoin}
        onTaxCalc={() => go("tax")}
      />
    ),
    tax: (
      <TaxScreen
        coins={coins}
        inputs={inputs}
        onBack={() => go("calc", -1)}
        onSaveResult={() => setSavedAt(new Date().toISOString())}
        onReset={resetAll}
        savedAt={savedAt}
        canStore={canStore}
      />
    ),
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
        <motion.main
          key={screen}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="app-main"
        >
          {screens[screen]}
        </motion.main>
        <BottomNav active={activeTab} onHome={() => go("home", -1)} onInfo={() => go("info", screen === "tokens" || screen === "calc" ? -1 : 1)} onCalc={() => go(lastCalcScreen)} />
      </div>
    </div>
  );
}
