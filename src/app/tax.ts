/**
 * cointax 계산 로직 — 순수 함수. UI와 분리되어 있으며 tax.test.ts로 검증한다.
 *
 * 세법 기준: 2026.10. 기준 (소득세법 §37⑤ 시행 전 보유분 취득가액 특례,
 * 기타소득 분리과세 20% + 지방소득세 2% = 22%, 기본공제 연 250만 원)
 * 규정이 바뀌면 TAX_RULES 한 곳만 고친다.
 */

export const TAX_RULES = {
  /** 과세 귀속연도 */
  year: 2027,
  /** 시행일(취득가액이 확정되는 시점) */
  effectiveDate: "2027년 1월 1일",
  /** 기본공제 (연) */
  basicDeduction: 2_500_000,
  /** 소득세율 */
  incomeTaxRate: 0.2,
  /** 지방소득세율 (소득세의 10%) */
  localTaxRate: 0.02,
  /** 취득가액 확인 곤란 시 필요경비 의제 비율 */
  deemedExpenseRate: 0.5,
  /** 신고·납부 기한 */
  filingDeadline: "2028년 5월 31일",
  /** 화면 표기용 기준일 */
  asOf: "2026.10. 기준",
} as const;

export type AcquisitionMethod = "실제 취득가 적용" | "특례 적용" | "의제 적용";

export type CoinInput = {
  /** 양도가액 (쉼표 포함 문자열) */
  saleAmt: string;
  /** 실제 취득가액 — 모르면 빈 문자열 */
  buyAmt: string;
  /** 필요경비(수수료 등) */
  expenses: string;
  /** 2027.1.1 전부터 보유했는지 */
  isOld: boolean;
  /** 시행일 0시 시가 (양도 수량 총액) — 모르면 빈 문자열 */
  marketAmt: string;
  /** 저장된 양도차익 (저장 전 null) */
  chaik: number | null;
};

export const EMPTY_COIN_INPUT: CoinInput = {
  saleAmt: "",
  buyAmt: "",
  expenses: "",
  isOld: false,
  marketAmt: "",
  chaik: null,
};

export function parseAmount(value: string): number {
  return Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;
}

export type CoinResult = {
  valid: boolean;
  sale: number;
  acquisition: number;
  expenses: number;
  method: AcquisitionMethod;
  gain: number;
};

/**
 * 코인 1종의 양도차익.
 *
 * 취득가액 결정 순서:
 *  1) 2027년 전부터 보유 + 시행일 0시 시가 입력 → Max(실제 취득가, 시가)  [특례 적용, §37⑤]
 *  2) 실제 취득가 입력 → 실제 취득가                                   [실제 취득가 적용]
 *  3) 둘 다 없음 → 양도가액 × 50% 를 필요경비로 의제, 별도 필요경비 불인정   [의제 적용]
 */
export function calculateCoin(input: CoinInput): CoinResult {
  const sale = parseAmount(input.saleAmt);
  const actual = parseAmount(input.buyAmt);
  const market = input.isOld ? parseAmount(input.marketAmt) : 0;
  const rawExpenses = parseAmount(input.expenses);

  const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
  const valid =
    positive(sale) &&
    (!input.buyAmt || positive(actual)) &&
    (!input.isOld || !input.marketAmt || positive(market)) &&
    Number.isSafeInteger(rawExpenses) &&
    rawExpenses >= 0;

  let method: AcquisitionMethod;
  let acquisition: number;
  if (market > 0) {
    method = "특례 적용";
    acquisition = Math.max(actual, market);
  } else if (actual > 0) {
    method = "실제 취득가 적용";
    acquisition = actual;
  } else {
    method = "의제 적용";
    acquisition = Math.floor(sale * TAX_RULES.deemedExpenseRate);
  }
  const expenses = method === "의제 적용" ? 0 : rawExpenses;

  return { valid, sale, acquisition, expenses, method, gain: sale - acquisition - expenses };
}

export type TaxResult = {
  totalGain: number;
  deduction: number;
  taxable: number;
  incomeTax: number;
  localTax: number;
  tax: number;
  /** true면 "신고·납부 없음" */
  noTax: boolean;
};

/**
 * 총 양도차익 → 세액.
 * 총차익이 0 이하이면 기본공제·과세표준 모두 0 (공제가 음수로 표시되는 일 없음).
 * 세액은 원 단위 절사.
 */
export function calculateTax(totalGain: number): TaxResult {
  const deduction = Math.min(TAX_RULES.basicDeduction, Math.max(0, totalGain));
  const taxable = Math.max(0, totalGain - deduction);
  const incomeTax = Math.floor(taxable * TAX_RULES.incomeTaxRate);
  const localTax = Math.floor(taxable * TAX_RULES.localTaxRate);
  return {
    totalGain,
    deduction,
    taxable,
    incomeTax,
    localTax,
    tax: incomeTax + localTax,
    noTax: taxable === 0,
  };
}

/** 저장된 코인들의 양도차익 합계 (저장 안 된 코인은 제외) */
export function sumSavedGains(inputs: CoinInput[]): number {
  return inputs.reduce((s, inp) => s + (inp.chaik ?? 0), 0);
}
