# cointax-app — 코인 세금도우미 MVP

세무법인케이앤피(cointax)의 가상자산 세금 확인 웹앱. 신한퓨처스랩 Tomorrow Challenge 베타(2026.10.26~30)용.

- 서버·DB 없음. 입력값은 브라우저 localStorage에만 저장
- 계산 로직: `src/app/tax.ts` (순수 함수) · 테스트: `src/app/tax.test.ts`
- 세법 기준: 2026.10. (`TAX_RULES` 한 곳에서 관리)

```bash
pnpm install
pnpm test        # 계산 로직 테스트
pnpm dev         # 로컬 개발
pnpm build       # dist/ 정적 빌드
```

표현 원칙: "세금이 줄어든다"·개별 세액 단정·"대화형 AI 상담" 금지. 결과 화면에 "입력값 기준 계산 결과, 신고는 실제 거래 기록으로" 고지.
