import { describe, it, expect } from "vitest";
import { calculateCoin, calculateTax, parseAmount, sumSavedGains, EMPTY_COIN_INPUT, TAX_RULES, type CoinInput } from "./tax";

// 테스트 기본값: 보유 질문에 "아니요"로 답한 상태. 미응답(null) 케이스는 별도 테스트.
const coin = (patch: Partial<CoinInput>): CoinInput => ({ ...EMPTY_COIN_INPUT, isOld: false, ...patch });

describe("parseAmount", () => {
  it("쉼표·공백·'원'을 제거하고 정수로", () => {
    expect(parseAmount("30,000,000")).toBe(30_000_000);
    expect(parseAmount(" 1,000 원")).toBe(1_000);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
  });
});

describe("calculateCoin — 취득가액 결정 분기", () => {
  it("실제 취득가 입력 → 실제 취득가 적용, 필요경비 차감", () => {
    const r = calculateCoin(coin({ saleAmt: "30,000,000", buyAmt: "20,000,000", expenses: "100,000" }));
    expect(r.valid).toBe(true);
    expect(r.method).toBe("실제 취득가 적용");
    expect(r.acquisition).toBe(20_000_000);
    expect(r.gain).toBe(9_900_000);
  });

  it("[이슈2] 취득가액 미입력 → 양도가액 전액이 차익이 되지 않고 50% 의제 적용", () => {
    const r = calculateCoin(coin({ saleAmt: "30,000,000" }));
    expect(r.valid).toBe(true);
    expect(r.method).toBe("의제 적용");
    expect(r.acquisition).toBe(15_000_000);
    expect(r.gain).toBe(15_000_000);
    expect(r.gain).not.toBe(30_000_000);
  });

  it("의제 적용 시 별도 필요경비는 공제하지 않음", () => {
    const r = calculateCoin(coin({ saleAmt: "10,000,000", expenses: "500,000" }));
    expect(r.method).toBe("의제 적용");
    expect(r.expenses).toBe(0);
    expect(r.gain).toBe(5_000_000);
  });

  it("의제 적용 시 홀수 양도가액은 원 단위 절사", () => {
    const r = calculateCoin(coin({ saleAmt: "1,000,001" }));
    expect(r.acquisition).toBe(500_000);
    expect(Number.isInteger(r.gain)).toBe(true);
  });

  it("[이슈4] 2027년 전 보유 + 시가 > 실제 취득가 → 시가 적용 (특례)", () => {
    const r = calculateCoin(coin({ saleAmt: "50,000,000", buyAmt: "20,000,000", isOld: true, marketAmt: "40,000,000" }));
    expect(r.method).toBe("특례 적용");
    expect(r.acquisition).toBe(40_000_000);
    expect(r.gain).toBe(10_000_000);
  });

  it("[이슈4] 2027년 전 보유 + 실제 취득가 > 시가 → 실제 취득가 적용 (Max)", () => {
    const r = calculateCoin(coin({ saleAmt: "50,000,000", buyAmt: "45,000,000", isOld: true, marketAmt: "40,000,000" }));
    expect(r.method).toBe("특례 적용");
    expect(r.acquisition).toBe(45_000_000);
    expect(r.gain).toBe(5_000_000);
  });

  it("[이슈4] 2027년 전 보유 + 실제 취득가 없음 + 시가 있음 → 시가 적용", () => {
    const r = calculateCoin(coin({ saleAmt: "50,000,000", isOld: true, marketAmt: "40,000,000" }));
    expect(r.method).toBe("특례 적용");
    expect(r.acquisition).toBe(40_000_000);
  });

  it("2027년 전 보유 + 실제 취득가·시가 모두 없음 → 의제 적용", () => {
    const r = calculateCoin(coin({ saleAmt: "50,000,000", isOld: true }));
    expect(r.method).toBe("의제 적용");
    expect(r.acquisition).toBe(25_000_000);
  });

  it("'아니요' 선택 시 이전에 입력한 시가는 무시", () => {
    const r = calculateCoin(coin({ saleAmt: "50,000,000", buyAmt: "20,000,000", isOld: false, marketAmt: "40,000,000" }));
    expect(r.method).toBe("실제 취득가 적용");
    expect(r.acquisition).toBe(20_000_000);
  });

  it("손실 코인은 음수 차익 그대로 반환 (이슈3: 손실 반영)", () => {
    const r = calculateCoin(coin({ saleAmt: "10,000,000", buyAmt: "13,000,000" }));
    expect(r.gain).toBe(-3_000_000);
  });

  it("보유 여부에 답하기 전(null)에는 금액이 있어도 invalid — 임의로 '아니요' 적용 금지", () => {
    const r = calculateCoin(coin({ saleAmt: "50,000,000", buyAmt: "20,000,000", isOld: null }));
    expect(r.valid).toBe(false);
    expect(EMPTY_COIN_INPUT.isOld).toBeNull();
  });

  it("양도가액 0 또는 미입력은 invalid", () => {
    expect(calculateCoin(coin({ saleAmt: "" })).valid).toBe(false);
    expect(calculateCoin(coin({ saleAmt: "0" })).valid).toBe(false);
  });

  it("취득가액에 0을 적으면 invalid (비워야 의제 적용)", () => {
    expect(calculateCoin(coin({ saleAmt: "1,000,000", buyAmt: "0" })).valid).toBe(false);
  });
});

describe("calculateTax — 기본공제·과세표준·세액", () => {
  it("[이슈1] 총 양도차익이 손실이면 기본공제는 음수가 아닌 0, 신고·납부 없음", () => {
    const t = calculateTax(-2_000_000);
    expect(t.deduction).toBe(0);
    expect(t.taxable).toBe(0);
    expect(t.tax).toBe(0);
    expect(t.noTax).toBe(true);
  });

  it("총 양도차익 0 → 공제 0, 신고·납부 없음", () => {
    const t = calculateTax(0);
    expect(t.deduction).toBe(0);
    expect(t.noTax).toBe(true);
  });

  it("기본공제 경계: 정확히 250만 원 → 과세표준 0, 신고·납부 없음", () => {
    const t = calculateTax(2_500_000);
    expect(t.deduction).toBe(2_500_000);
    expect(t.taxable).toBe(0);
    expect(t.noTax).toBe(true);
  });

  it("기본공제 경계: 250만 1원 → 과세표준 1원, 세액 0원(절사)이지만 신고 대상", () => {
    const t = calculateTax(2_500_001);
    expect(t.taxable).toBe(1);
    expect(t.tax).toBe(0);
    expect(t.noTax).toBe(false);
  });

  it("250만 원 미만 차익 → 공제는 차익만큼만, 과세표준 0", () => {
    const t = calculateTax(1_000_000);
    expect(t.deduction).toBe(1_000_000);
    expect(t.taxable).toBe(0);
    expect(t.noTax).toBe(true);
  });

  it("FAQ 예시: 500만 원 차익 → 소득세 50만, 지방소득세 5만, 합계 55만", () => {
    const t = calculateTax(5_000_000);
    expect(t.deduction).toBe(2_500_000);
    expect(t.taxable).toBe(2_500_000);
    expect(t.incomeTax).toBe(500_000);
    expect(t.localTax).toBe(50_000);
    expect(t.tax).toBe(550_000);
  });

  it("소득세·지방소득세는 각각 원 단위 절사", () => {
    const t = calculateTax(2_500_000 + 1_234_567);
    expect(t.incomeTax).toBe(Math.floor(1_234_567 * 0.2));
    expect(t.localTax).toBe(Math.floor(1_234_567 * 0.02));
    expect(Number.isInteger(t.tax)).toBe(true);
  });

  it("세율 상수가 22%로 일관됨", () => {
    expect(TAX_RULES.incomeTaxRate + TAX_RULES.localTaxRate).toBeCloseTo(0.22);
  });
});

describe("손익 통산 (MVP 검토서 재현 케이스)", () => {
  it("BTC −300만 + ETH +100만 = −200만 → 공제 0, 세액 0", () => {
    const btc = calculateCoin(coin({ saleAmt: "7,000,000", buyAmt: "10,000,000", chaik: null }));
    const eth = calculateCoin(coin({ saleAmt: "3,000,000", buyAmt: "2,000,000", chaik: null }));
    const total = sumSavedGains([{ ...EMPTY_COIN_INPUT, chaik: btc.gain }, { ...EMPTY_COIN_INPUT, chaik: eth.gain }]);
    expect(total).toBe(-2_000_000);
    const t = calculateTax(total);
    expect(t.deduction).toBe(0);
    expect(t.tax).toBe(0);
  });

  it("저장하지 않은 코인(chaik null)은 합산에서 제외", () => {
    expect(sumSavedGains([{ ...EMPTY_COIN_INPUT, chaik: 1_000_000 }, { ...EMPTY_COIN_INPUT, chaik: null }])).toBe(1_000_000);
  });
});
