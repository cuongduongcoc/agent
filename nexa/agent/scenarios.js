// agent/scenarios.js — Demo scenarios (5 phases, 2 entry points)
// Entry Point A: Customer doesn't have enough readiness from start
// Entry Point B: Customer refuses product (main demo)

const engine = require('./engine');
const dataLoader = require('../data-loader');

// ─── Scenario A: Not enough readiness from start ────────────────────
// Customer VN00001: Lý Văn Long, 41, Tiểu thương
// Need=High(77.6), Readiness=Low(36.7) → Micro-saving pathway
// Then at T+x, new event (income increased, balance improved) → re-assess → offer → accept → GCNBH
function scenarioA() {
  engine.resetScenes();
  const customerId = 'VN00001';
  const scenes = [];

  // Title
  scenes.push(engine.runAssessment.__proto__ ? null : null); // placeholder removed below

  // Phase 1 — T0: Initial assessment
  const title = {
    id: 1, type: 'title', title: 'Entry Point A · Chưa đủ readiness',
    narration: 'Khách hàng có nhu cầu bảo vệ cao nhưng chưa sẵn sàng tài chính. NEXA chọn can thiệp ít ma sát: Micro-saving pathway.',
    duration: 4.0,
  };

  // Re-run with proper IDs
  engine.resetScenes();
  const all = [];

  // T0 assessment
  const t0 = engine.runAssessment(customerId, null, 'T0');
  all.push(...t0.scenes);

  // Action: Micro-saving
  all.push(engine.actionMicroSaving(customerId, 'T0'));

  // Phase 2 — T0→T+x: Time passes, nurture
  all.push(engine.timePass(30, 'T+30'));
  all.push(engine.actionEducateNurture(customerId, 'T+30'));

  // Phase 3 — T+x: New event — income increased, balance improved, searched insurance
  const tPlusOverrides = {
    monthly_income_trVND: 12.5,        // income increased from 8.64 to 12.5
    balance_end_month_trVND: 3.2,      // balance improved from 0.56 to 3.2
    balance_trend_ne0_1: 1,            // upward trend
    financial_stress_1to5: 3,          // stress reduced from 4 to 3
    income_stable_3m: 1,               // now stable
    income_volatility_cv: 0.15,        // lower volatility
    insurance_page_views_month: 12,    // searched insurance products
    transfer_count_month: 15,          // transferring to relatives (hospital fees)
  };
  all.push(engine.newEvent(customerId,
    'Khách mở app MSB, thu nhập tăng, số dư cải thiện. Khách tìm kiếm sản phẩm bảo hiểm trên app, nán lại ở trang thông tin BH. Khách thường xuyên chuyển tiền cho người thân — có thể thanh toán viện phí.',
    tPlusOverrides, 'T+30'
  ));

  // Re-assess at T+x
  const tx = engine.runAssessment(customerId, tPlusOverrides, 'T+30');
  all.push(...tx.scenes);

  // Action: Offer Insurance (readiness now improved)
  all.push(engine.actionOfferInsurance(customerId, tx.result, 'T+30'));

  // Phase 4 — T+x + response: Customer agrees
  all.push(...engine.customerAgrees(customerId, 'T+30'));

  // Phase 5 — GCNBH
  all.push(engine.gcnbhScene(customerId, tx.result, 'T+30'));
  all.push(engine.terminateScene('T+30'));

  return { title, scenes: all, customerId, entryPoint: 'A' };
}

// ─── Scenario B: Customer refuses product (main demo) ───────────────
// Customer VN00005: Đặng Minh Giang, 53, Tài xế Grab
// Need=High(83.9), Readiness=Medium(55.5) → Educate & Nurture
// Prior offer refused (from G6 interaction history)
// Flow: T0 offer → refuse → replan → T+30 nurture → T+60 new event → re-assess → offer again → accept → GCNBH
function scenarioB() {
  engine.resetScenes();
  const customerId = 'VN00005';
  const title = {
    type: 'title', title: 'Entry Point B · Khách từ chối sản phẩm',
    narration: 'Khách hàng từ chối đề xuất bảo hiểm trước đó. NEXA quan sát, re-plan, và re-engage đúng thời điểm khi có evidence mới.',
    duration: 4.0,
  };
  const all = [];

  // Phase 1 — T0: Initial assessment (customer already had prior offer refused)
  // We simulate the initial offer that was already made
  const t0 = engine.runAssessment(customerId, null, 'T0');
  all.push(...t0.scenes);

  // Action: Offer Insurance
  all.push(engine.actionOfferInsurance(customerId, t0.result, 'T0'));

  // Phase 2 — T0 + response: Customer refuses
  all.push(...engine.customerRefuses(customerId, 'T0'));

  // Phase 3 — T0→T+30: No new event → Educate & Nurture
  all.push(engine.timePass(30, 'T+30'));
  all.push(engine.actionEducateNurture(customerId, 'T+30'));

  // Phase 4 — T+60: New event — customer opens app, transfers to relatives (hospital fees),
  // lingers on insurance info page, searches insurance products
  const tPlusOverrides = {
    insurance_page_views_month: 15,    // searched insurance products heavily
    transfer_count_month: 20,          // transferring to relatives for hospital fees
    balance_end_month_trVND: 2.8,      // balance improved
    balance_trend_ne0_1: 1,            // upward trend
    financial_stress_1to5: 2,          // stress reduced
    income_stable_3m: 1,               // now stable
    income_volatility_cv: 0.15,        // lower volatility
    readiness_score: 72,               // readiness improved
    readiness_level: 'High',
    app_login_freq_month: 25,          // more active on app
    days_since_last_login: 1,          // just opened app
  };
  all.push(engine.newEvent(customerId,
    'Khách mở app MSB, chuyển tiền cho người thân thanh toán viện phí. Khách tìm kiếm sản phẩm bảo hiểm trên app, nán lại ở trang thông tin BH. Số dư cải thiện, thu nhập ổn định hơn.',
    tPlusOverrides, 'T+60'
  ));

  // Re-assess at T+60
  const tx = engine.runAssessment(customerId, tPlusOverrides, 'T+60');
  all.push(...tx.scenes);

  // Action: Offer Insurance again (now with improved readiness)
  all.push(engine.actionOfferInsurance(customerId, tx.result, 'T+60'));

  // Phase 5 — T+60 + response: Customer agrees
  all.push(...engine.customerAgrees(customerId, 'T+60'));

  // GCNBH
  all.push(engine.gcnbhScene(customerId, tx.result, 'T+60'));
  all.push(engine.terminateScene('T+60'));

  return { title, scenes: all, customerId, entryPoint: 'B' };
}

// ─── Scenario C: Direct offer (high need + high readiness) ──────────
// Customer VN00012: Nguyễn Thị Trang, 41, NV Văn phòng
// Need=High(75), Readiness=High(90) → Offer Insurance → accept → GCNBH
function scenarioC() {
  engine.resetScenes();
  const customerId = 'VN00012';
  const title = {
    type: 'title', title: 'Đúng nhu cầu. Đúng thời điểm.',
    narration: 'Khách hàng có nhu cầu bảo vệ cao và sẵn sàng tài chính. NEXA đề xuất bảo hiểm ngay tại thời điểm giao dịch.',
    duration: 4.0,
  };
  const all = [];

  const t0 = engine.runAssessment(customerId, null, 'T0');
  all.push(...t0.scenes);
  all.push(engine.actionOfferInsurance(customerId, t0.result, 'T0'));
  all.push(...engine.customerAgrees(customerId, 'T0'));
  all.push(engine.gcnbhScene(customerId, t0.result, 'T0'));
  all.push(engine.terminateScene('T0'));

  return { title, scenes: all, customerId, entryPoint: 'C' };
}

// ─── Get all scenarios ───────────────────────────────────────────────
function getScenarios() {
  return [
    { id: 'A', name: 'Entry Point A — Chưa đủ readiness', customer: 'VN00001', desc: 'Nhu cầu cao nhưng chưa sẵn sàng → Micro-saving → T+x re-assess → Offer → GCNBH' },
    { id: 'B', name: 'Entry Point B — Khách từ chối sản phẩm', customer: 'VN00005', desc: 'Offer → Refuse → Replan → Nurture → T+x new event → Re-offer → Accept → GCNBH' },
    { id: 'C', name: 'Direct Offer — Đủ điều kiện', customer: 'VN00012', desc: 'High need + High readiness → Offer → Accept → GCNBH' },
  ];
}

function runScenario(id) {
  switch (id) {
    case 'A': return scenarioA();
    case 'B': return scenarioB();
    case 'C': return scenarioC();
    default: return scenarioB();
  }
}

module.exports = { getScenarios, runScenario };
