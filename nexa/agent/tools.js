// agent/tools.js — Implements the 3 agent tools based on 05_ScoringEngine formulas
// Tool ②: Protection Need Score (WHY)
// Tool ③: Protection Readiness Score (WHEN)
// Tool ④: Product Knowledge Base (WHAT)

// ─── Tool ②: Protection Need Score ───────────────────────────────────
// Formula from sheet 05_ScoringEngine:
//   Health vulnerability     30% × (health_status - 1) / 4 × 100
//   Recent medical event      30% × recent_medical_event × 100
//   No private insurance      25% × (1 - has_private_insurance) × 100
//   Dependents                10% × min(dependents / 3, 1) × 100
//   Healthcare spending        5% × min(healthcare_spending / 1000, 1) × 100
//   TOTAL = Σ(weight × sub-score)
//   High: ≥70 | Medium: 45-69 | Low: <45
function computeProtectionNeed(ctx) {
  const healthStatus = ctx.health_status_1to5 || 3;        // 1=Excellent, 5=Poor
  const recentMedicalEvent = ctx.recent_medical_event || 0; // 0 or 1
  const hasPrivateIns = ctx.has_private_insurance || 0;     // 0 or 1
  const dependents = ctx.dependents || 0;
  const healthcareSpending = ctx.healthcare_spending_kVND || 0;

  const sub = {
    health_vulnerability: {
      weight: 0.30,
      raw: ((healthStatus - 1) / 4) * 100,
      note: `Sức khỏe ${healthStatus}/5 → ${(((healthStatus - 1) / 4) * 100).toFixed(0)} điểm`,
    },
    recent_medical_event: {
      weight: 0.30,
      raw: recentMedicalEvent * 100,
      note: recentMedicalEvent ? 'Có sự kiện y tế gần đây → 100 điểm' : 'Không có sự kiện y tế → 0 điểm',
    },
    no_private_insurance: {
      weight: 0.25,
      raw: (1 - hasPrivateIns) * 100,
      note: hasPrivateIns ? 'Đã có BH tư nhân → 0 điểm' : 'Chưa có BH tư nhân → 100 điểm',
    },
    dependents: {
      weight: 0.10,
      raw: Math.min(dependents / 3, 1) * 100,
      note: `${dependents} người phụ thuộc → ${(Math.min(dependents / 3, 1) * 100).toFixed(0)} điểm`,
    },
    healthcare_spending: {
      weight: 0.05,
      raw: Math.min(healthcareSpending / 1000, 1) * 100,
      note: `Chi y tế ${healthcareSpending}k → ${(Math.min(healthcareSpending / 1000, 1) * 100).toFixed(0)} điểm`,
    },
  };

  let score = Object.values(sub).reduce((s, d) => s + d.weight * d.raw, 0);

  // If dataset has a pre-computed score and no overrides, use it (one source of truth)
  if (ctx.protection_need_score != null && !ctx._recomputed) {
    score = ctx.protection_need_score;
  }

  score = Math.min(Math.max(score, 0), 100);
  const level = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
  return { score: Math.round(score * 10) / 10, level, subScores: sub };
}

// ─── Tool ③: Protection Readiness Score ──────────────────────────────
// Formula from sheet 05_ScoringEngine:
//   Affordability       40% × (income/20×0.35 + (5-stress)/4×0.35 + balance/5×0.20 + (1-debt_ratio)×0.10) × 100
//   Financial stability 30% × ((1-volatility/0.8)×0.5 + stable_3m×0.3 + (trend+1)/2×0.2) × 100
//   Access Readiness    20% × (1 - (volatility×0.5 + (1-mobile)×0.3 + 0.2)) × 100
//   Engagement          10% × (mobile×0.4 + savings×0.3 + min(tx/50,1)×0.3) × 100
//   TOTAL = 0.40×Afford + 0.30×Stability + 0.20×AccessReady + 0.10×Engage
//   High: ≥70 | Medium: 50-69 | Low: <50
function computeProtectionReadiness(ctx) {
  const income = ctx.monthly_income_trVND || 0;
  const stress = ctx.financial_stress_1to5 || 3;
  const balance = ctx.balance_end_month_trVND || 0;
  const debt = ctx.monthly_debt_trVND || 0;
  const volatility = ctx.income_volatility_cv || 0;
  const stable3m = ctx.income_stable_3m || 0;
  const trend = ctx.balance_trend_ne0_1 || 0;  // -1, 0, 1
  const mobile = ctx.mobile_banking || 0;
  const savings = ctx.savings_product || 0;
  const tx = ctx.tx_per_month || 0;

  const debtRatio = income > 0 ? Math.min(debt / income, 1) : 1;

  const sub = {
    affordability: {
      weight: 0.40,
      raw: (income / 20 * 0.35 + (5 - stress) / 4 * 0.35 + balance / 5 * 0.20 + (1 - debtRatio) * 0.10) * 100,
      note: `Thu nhập ${income}tr, stress ${stress}/5, balance ${balance}tr, debt ${debt}tr`,
    },
    financial_stability: {
      weight: 0.30,
      raw: ((1 - volatility / 0.8) * 0.5 + stable3m * 0.3 + (trend + 1) / 2 * 0.2) * 100,
      note: `Volatility ${volatility}, stable3m ${stable3m}, trend ${trend}`,
    },
    access_readiness: {
      weight: 0.20,
      raw: (1 - (volatility * 0.5 + (1 - mobile) * 0.3 + 0.2)) * 100,
      note: `Volatility ${volatility}, mobile ${mobile}`,
    },
    engagement: {
      weight: 0.10,
      raw: (mobile * 0.4 + savings * 0.3 + Math.min(tx / 50, 1) * 0.3) * 100,
      note: `Mobile ${mobile}, savings ${savings}, tx ${tx}/tháng`,
    },
  };

  let score = 0.40 * sub.affordability.raw + 0.30 * sub.financial_stability.raw +
              0.20 * sub.access_readiness.raw + 0.10 * sub.engagement.raw;

  // If dataset has pre-computed sub-scores and no overrides, use them (one source of truth)
  if (!ctx._recomputed) {
    if (ctx.affordability_score != null) sub.affordability.raw = ctx.affordability_score;
    if (ctx.financial_stability != null) sub.financial_stability.raw = ctx.financial_stability;
    if (ctx.access_readiness != null) sub.access_readiness.raw = ctx.access_readiness;
    if (ctx.engagement_score != null) sub.engagement.raw = ctx.engagement_score;
    if (ctx.readiness_score != null) {
      score = ctx.readiness_score;
    } else {
      score = 0.40 * sub.affordability.raw + 0.30 * sub.financial_stability.raw +
              0.20 * sub.access_readiness.raw + 0.10 * sub.engagement.raw;
    }
  }

  score = Math.min(Math.max(score, 0), 100);
  const level = score >= 70 ? 'High' : score >= 50 ? 'Medium' : 'Low';
  return { score: Math.round(score * 10) / 10, level, subScores: sub };
}

// ─── Tool ④: Product Knowledge Base ──────────────────────────────────
// Decision matrix from sheet 05_ScoringEngine (AGENT DECISION MATRIX)
// Returns: { action, product, intervention, rationale }
function queryProductKB(needLevel, readinessLevel, affordabilityScore, products, seed) {
  seed = seed || 0;
  const matrix = {
    'High|High': { action: 'Offer Insurance', intervention: 'Immediate offer', rationale: 'Need≥70 + Ready≥70' },
    'High|Medium': { action: 'Educate & Nurture', intervention: 'Content + 30-day re-score', rationale: 'Need≥70 + Ready 50-69' },
    'High|Low': { action: 'Micro-saving pathway', intervention: 'Round-up → Health Basic', rationale: 'Need≥70 + Ready<50' },
    'Medium|High': { action: 'Offer Insurance', intervention: 'Soft offer', rationale: 'Need 45-69 + Ready≥70' },
    'Medium|Medium': { action: 'Educate & Nurture', intervention: 'Content + 60-day re-score', rationale: 'Need 45-69 + Ready 50-69' },
    'Medium|Low': { action: 'Suppress — Not ready', intervention: '90-day re-score', rationale: 'Need 45-69 + Ready<50' },
    'Low|High': { action: 'Suppress — No need', intervention: 'No action', rationale: 'Need<45' },
    'Low|Medium': { action: 'Suppress — No need', intervention: 'No action', rationale: 'Need<45' },
    'Low|Low': { action: 'Suppress — Not ready', intervention: '90-day re-score', rationale: 'Need<45 + Ready<50' },
  };

  const key = `${needLevel}|${readinessLevel}`;
  const decision = matrix[key] || { action: 'Suppress — No need', intervention: 'No action', rationale: 'Unknown' };

  // Pick product based on affordability — diversified across RP01-RP04
  let product = null;
  const pickBySeed = (candidates) => candidates.filter(Boolean)[seed % candidates.filter(Boolean).length];

  if (decision.action === 'Offer Insurance' && products && products.length > 0) {
    if (affordabilityScore >= 65) {
      product = pickBySeed([
        products.find(p => p.product_id === 'RP04' && p.tier_name === 'Kim Cương'),
        products.find(p => p.product_id === 'RP02' && p.tier_name === 'Platinum'),
        products.find(p => p.product_id === 'RP03' && p.tier_name === 'Platinum'),
        products.find(p => p.product_id === 'RP01' && p.tier_name === 'Kim Cương'),
      ]);
    } else if (affordabilityScore >= 40) {
      product = pickBySeed([
        products.find(p => p.product_id === 'RP02' && p.tier_name === 'Gold'),
        products.find(p => p.product_id === 'RP01' && p.tier_name === 'Vàng'),
        products.find(p => p.product_id === 'RP03' && p.tier_name === 'Gold'),
        products.find(p => p.product_id === 'RP04' && p.tier_name === 'Bạc'),
      ]);
    } else {
      product = pickBySeed([
        products.find(p => p.product_id === 'RP01' && p.tier_name === 'Đồng'),
        products.find(p => p.product_id === 'RP02' && p.tier_name === 'Silver'),
        products.find(p => p.product_id === 'RP03' && p.tier_name === 'Silver'),
        products.find(p => p.product_id === 'RP04' && p.tier_name === 'Đồng'),
      ]);
    }
  } else if (decision.action === 'Educate & Nurture' && products && products.length > 0) {
    product = pickBySeed([
      products.find(p => p.product_id === 'RP01' && p.tier_name === 'Bạc'),
      products.find(p => p.product_id === 'RP02' && p.tier_name === 'Gold'),
      products.find(p => p.product_id === 'RP03' && p.tier_name === 'Gold'),
      products.find(p => p.product_id === 'RP04' && p.tier_name === 'Vàng'),
    ]);
  } else if (decision.action === 'Micro-saving pathway') {
    product = { product_name: 'Round-up Save', tier_name: 'Micro-saving', monthly_premium_kVND: '50-100' };
  }

  return { ...decision, product };
}

// ─── Evidence Strength (0-7 signals) ────────────────────────────────
function computeEvidenceStrength(ctx, need, readiness) {
  let count = 0;
  const signals = [];
  if (need.level === 'High' || need.level === 'Medium') { count++; signals.push('Protection need detected'); }
  if (readiness.level === 'High' || readiness.level === 'Medium') { count++; signals.push('Readiness detected'); }
  if (ctx.has_private_insurance === 0) { count++; signals.push('No private insurance'); }
  if (ctx.recent_medical_event === 1) { count++; signals.push('Recent medical event'); }
  if (ctx.mobile_banking === 1) { count++; signals.push('Active digital banking'); }
  if ((ctx.insurance_page_views_month || 0) > 0) { count++; signals.push('Viewed insurance pages'); }
  if ((ctx.transfer_count_month || 0) > 10) { count++; signals.push('Frequent transfers (potential dependents support)'); }
  return { count, total: 7, signals };
}

// ─── Decision Gate ───────────────────────────────────────────────────
function evaluateDecisionGate(evidence, need, readiness, product) {
  // High-value product + medium readiness → HUMAN-IN-THE-LOOP
  const isHighValue = product && product.tier_name === 'Kim Cương';
  if (isHighValue && readiness.level === 'Medium') {
    return { gate: 'HUMAN-IN-THE-LOOP', auto: false, reason: 'High-value product + medium readiness → RM Approval required' };
  }
  // Insufficient evidence
  if (evidence.count < 3) {
    return { gate: 'INSUFFICIENT EVIDENCE → Human review', auto: false, reason: `${evidence.count}/7 signals — not enough evidence` };
  }
  // Low risk / high confidence
  if (evidence.count >= 5 && readiness.level === 'High') {
    return { gate: 'LOW RISK / HIGH CONFIDENCE → Auto', auto: true, reason: `${evidence.count}/7 signals + high readiness` };
  }
  // Default: medium risk
  return { gate: 'MEDIUM RISK → Auto with flag', auto: true, reason: `${evidence.count}/7 signals — proceed with monitoring` };
}

module.exports = {
  computeProtectionNeed,
  computeProtectionReadiness,
  queryProductKB,
  computeEvidenceStrength,
  evaluateDecisionGate,
};
