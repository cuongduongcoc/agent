// agent/engine.js — Main agent loop orchestrator
// Produces a sequence of "scenes" representing the full agentic loop:
//   REASONING → CONTEXT → TOOLS(②③④) → OBSERVATION → DECISION GATE → ACTION
//   → OBSERVATION(post-action) → RE-PLANNING → NEXT ACTION
// Each scene = { id, type, title, narration, phone, reasoning, data, duration }

const {
  computeProtectionNeed,
  computeProtectionReadiness,
  queryProductKB,
  computeEvidenceStrength,
  evaluateDecisionGate,
} = require('./tools');
const dataLoader = require('../data-loader');

// ─── Helper: format VND ──────────────────────────────────────────────
function vnd(n) {
  if (!n || n === null) return '—';
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
}
function tr(n) { return (n || 0).toFixed(1).replace('.0', '') + 'tr'; }

// ─── Helper: segment label ───────────────────────────────────────────
const SEG_LABEL = {
  tieu_thuong: 'Tiểu thương',
  nhan_vien_van_phong: 'NV Văn phòng',
  freelancer: 'Freelancer',
  gig_worker: 'Tài xế Grab',
  cong_nhan: 'Công nhân',
};

// ─── Build a customer context object from dataset ────────────────────
function buildContext(customerId, overrides) {
  const { full, profile, realtime, interaction, loopState } = dataLoader.getCustomer(customerId);
  if (!full) return null;
  const hasOverrides = overrides && Object.keys(overrides).length > 0;
  const ctx = { ...full, ...(overrides || {}), _recomputed: hasOverrides };
  return {
    ctx,
    profile,
    realtime,
    interaction,
    loopState,
    fullName: profile ? profile['Tên KH'] : customerId,
    segment: SEG_LABEL[full.segment] || full.segment,
  };
}

// ─── Scene builders ──────────────────────────────────────────────────
let _sceneId = 0;
function scene(type, title, narration, opts) {
  return {
    id: ++_sceneId,
    type,
    title,
    narration,
    phone: opts?.phone || null,
    reasoning: opts?.reasoning || null,
    data: opts?.data || null,
    tapAction: opts?.tapAction || null,
    duration: opts?.duration || 4.0,
  };
}

// ─── Run the full agent loop for a customer at a given time point ────
// Returns an array of scenes + the agent assessment result
function runAssessment(customerId, overrides, label) {
  const info = buildContext(customerId, overrides);
  if (!info) return { scenes: [], result: null };
  const { ctx, fullName, segment } = info;
  const products = dataLoader.getProducts();
  const scenes = [];

  // ① REASONING / PLANNING
  scenes.push(scene('reasoning',
    `${label || 'T0'} · Lập kế hoạch`,
    `NEXA phân tích khách hàng ${fullName}, ${segment}, ${ctx.age} tuổi. Tôi cần đánh giá nhu cầu bảo vệ, mức độ sẵn sàng, và sản phẩm phù hợp. Sẽ gọi công cụ ② Nhu cầu, ③ Sẵn sàng, ④ Sản phẩm.`,
    {
      reasoning: {
        question: 'Tôi cần những thông tin gì? Thông tin nào còn thiếu? Tôi nên gọi những công cụ nào?',
        plan: ['Tool ② Protection Need — đánh giá WHY', 'Tool ③ Protection Readiness — đánh giá WHEN', 'Tool ④ Product KB — đánh giá WHAT'],
      },
      data: { customer_id: customerId, name: fullName, segment, age: ctx.age },
    }
  ));

  // ① CUSTOMER CONTEXT
  scenes.push(scene('context',
    `${label || 'T0'} · Ngữ cảnh khách hàng`,
    `Dữ liệu tĩnh: thu nhập ${tr(ctx.monthly_income_trVND)}/tháng, số dư ${tr(ctx.balance_end_month_trVND)}tr, sức khỏe ${ctx.health_status_1to5}/5, stress tài chính ${ctx.financial_stress_1to5}/5. Dữ liệu real-time: đăng nhập app ${ctx.app_login_freq_month} lần/tháng, ${ctx.most_used_service}, xem trang bảo hiểm ${ctx.insurance_page_views_month} lần/tháng.`,
    {
      phone: { view: 'app_home', customer: { name: fullName, balance: ctx.balance_end_month_trVND } },
      reasoning: {
        static: {
          'Thu nhập': `${tr(ctx.monthly_income_trVND)}/tháng`,
          'Số dư': `${tr(ctx.balance_end_month_trVND)}tr`,
          'Sức khỏe': `${ctx.health_status_1to5}/5`,
          'Stress': `${ctx.financial_stress_1to5}/5`,
          'Có BH tư nhân': ctx.has_private_insurance ? 'Có' : 'Không',
          'Sự kiện y tế gần đây': ctx.recent_medical_event ? 'Có' : 'Không',
        },
        realtime: {
          'Đăng nhập app': `${ctx.app_login_freq_month} lần/tháng`,
          'Dịch vụ hay dùng': ctx.most_used_service,
          'Xem trang BH': `${ctx.insurance_page_views_month} lần/tháng`,
          'Giao dịch/tháng': `${ctx.tx_per_month} giao dịch`,
          'Chuyển tiền/tháng': `${ctx.transfer_count_month} lần`,
        },
      },
    }
  ));

  // ② TOOL: Protection Need
  const need = computeProtectionNeed(ctx);
  scenes.push(scene('tool_need',
    `${label} · Tool ② Nhu cầu bảo vệ`,
    `Tool ② Protection Need: Điểm nhu cầu = ${need.score}/100 → mức ${need.level}. ${need.subScores.no_private_insurance.note}. ${need.subScores.recent_medical_event.note}. ${need.subScores.health_vulnerability.note}.`,
    {
      reasoning: {
        tool: '② Protection Need (WHY)',
        score: need.score,
        level: need.level,
        subScores: need.subScores,
        formula: 'Health vuln 30% + Medical event 30% + No insurance 25% + Dependents 10% + Health spending 5%',
      },
    }
  ));

  // Early stopping: if need is Low, suppress
  if (need.level === 'Low') {
    scenes.push(scene('decision',
      `${label} · Decision Gate`,
      `Nhu cầu thấp (${need.score}/100). Không có nhu cầu bảo vệ rõ ràng. Agent dừng sớm — không gọi thêm công cụ. Hành động: Suppress — re-score trong 90 ngày.`,
      {
        reasoning: {
          gate: 'SUPPRESS — No need',
          auto: true,
          reason: 'Need < 45 → early stopping saves compute',
        },
      }
    ));
    return { scenes, result: { need, readiness: null, product: null, action: 'Suppress — No need' } };
  }

  // ③ TOOL: Protection Readiness
  const readiness = computeProtectionReadiness(ctx);
  scenes.push(scene('tool_readiness',
    `${label} · Tool ③ Sẵn sàng`,
    `Tool ③ Protection Readiness: Điểm sẵn sàng = ${readiness.score}/100 → mức ${readiness.level}. Khả năng chi trả ${readiness.subScores.affordability.raw.toFixed(0)}, ổn định tài chính ${readiness.subScores.financial_stability.raw.toFixed(0)}, tiếp cận số ${readiness.subScores.access_readiness.raw.toFixed(0)}, tương tác ${readiness.subScores.engagement.raw.toFixed(0)}.`,
    {
      reasoning: {
        tool: '③ Protection Readiness (WHEN)',
        score: readiness.score,
        level: readiness.level,
        subScores: readiness.subScores,
        formula: 'Afford 40% + Stability 30% + Access 20% + Engagement 10%',
      },
    }
  ));

  // Early stopping: if readiness is Low and need is High → micro-saving (skip ④ for insurance)
  if (readiness.level === 'Low') {
    scenes.push(scene('tool_product',
      `${label} · Tool ④ Sản phẩm`,
      `Readiness thấp (${readiness.score}/100). Agent bỏ qua sản phẩm BH truyền thống, chuyển sang micro-saving pathway. Round-up Save: 50-100k/tháng → tích lũy → BH Basic sau 3-6 tháng.`,
      {
        reasoning: {
          tool: '④ Product KB (WHAT)',
          decision: 'Micro-saving pathway',
          rationale: 'Need present but not ready → affordability pathway',
        },
      }
    ));
    scenes.push(scene('decision',
      `${label} · Decision Gate`,
      `Nhu cầu ${need.level} nhưng sẵn sàng ${readiness.level}. Agent chọn can thiệp ít ma sát: Micro-saving. Không ép bán BH khi khách chưa sẵn sàng tài chính.`,
      {
        reasoning: {
          gate: 'MEDIUM RISK → Auto with flag',
          auto: true,
          reason: 'High need + Low readiness → micro-saving pathway',
        },
      }
    ));
    return { scenes, result: { need, readiness, product: { product_name: 'Round-up Save' }, action: 'Micro-saving pathway' } };
  }

  // ④ TOOL: Product KB
  const productDecision = queryProductKB(need.level, readiness.level, readiness.subScores.affordability.raw, products);
  scenes.push(scene('tool_product',
    `${label} · Tool ④ Sản phẩm`,
    `Tool ④ Product KB: Need=${need.level}, Readiness=${readiness.level} → Action: ${productDecision.action}. ${productDecision.product ? 'Sản phẩm: ' + (productDecision.product.product_name + (productDecision.product.tier_name ? ' — ' + productDecision.product.tier_name : '')) : 'Không đề xuất'}.`,
    {
      reasoning: {
        tool: '④ Product KB (WHAT)',
        decision: productDecision.action,
        intervention: productDecision.intervention,
        rationale: productDecision.rationale,
        product: productDecision.product,
      },
    }
  ));

  // OBSERVATION
  const evidence = computeEvidenceStrength(ctx, need, readiness);
  scenes.push(scene('observation',
    `${label} · Quan sát`,
    `Bằng chứng: ${evidence.count}/7 tín hiệu. ${evidence.signals.join('; ')}. Need=${need.score}(${need.level}), Readiness=${readiness.score}(${readiness.level}). ${productDecision.product ? 'Sản phẩm phù hợp: ' + productDecision.product.product_name : 'Không có sản phẩm.'}`,
    {
      reasoning: {
        evidence: evidence.signals,
        evidenceCount: `${evidence.count}/7`,
        need: `${need.score} (${need.level})`,
        readiness: `${readiness.score} (${readiness.level})`,
        product: productDecision.product ? `${productDecision.product.product_name}${productDecision.product.tier_name ? ' — ' + productDecision.product.tier_name : ''}` : 'None',
      },
    }
  ));

  // DECISION GATE
  const gate = evaluateDecisionGate(evidence, need, readiness, productDecision.product);
  scenes.push(scene('decision',
    `${label} · Decision Gate`,
    `Decision Gate: ${gate.gate}. ${gate.reason}. ${gate.auto ? 'Agent tự động thực hiện hành động.' : 'Chuyển sang human-in-the-loop — cần RM phê duyệt.'}`,
    {
      reasoning: {
        gate: gate.gate,
        auto: gate.auto,
        reason: gate.reason,
      },
    }
  ));

  return {
    scenes,
    result: {
      need,
      readiness,
      product: productDecision.product,
      action: productDecision.action,
      intervention: productDecision.intervention,
      evidence,
      gate,
    },
  };
}

// ─── ACTION scene ────────────────────────────────────────────────────
function actionOfferInsurance(customerId, result, label) {
  const info = buildContext(customerId);
  const fullName = info?.fullName || customerId;
  const product = result.product;
  const productName = product ? `${product.product_name}${product.tier_name ? ' — ' + product.tier_name : ''}` : 'Bảo hiểm';
  const premium = info?.ctx?.recommended_premium_vnd || 0;

  return scene('action_offer',
    `${label} · Action: Offer Insurance`,
    `NEXA đề xuất ${productName} cho ${fullName}. Phí ước tính ${vnd(premium)}/năm. Đề xuất được gửi qua push notification trong app MSB — đúng lúc khách đang giao dịch.`,
    {
      phone: {
        view: 'insurance_offer',
        customer: { name: fullName },
        product: { name: productName, premium: vnd(premium) },
      },
      reasoning: {
        action: 'Offer Insurance',
        product: productName,
        premium: vnd(premium) + '/năm',
        channel: 'Push notification in-app',
        timing: 'Contextual — tại thời điểm giao dịch',
      },
      tapAction: { label: 'Xem đề xuất', target: 'offer_detail' },
    }
  );
}

function actionEducateNurture(customerId, label) {
  const info = buildContext(customerId);
  const fullName = info?.fullName || customerId;
  return scene('action_nurture',
    `${label} · Action: Educate & Nurture`,
    `NEXA chọn Educate & Nurture — gửi nội dung giáo dục tài chính & ý thức bảo vệ thay vì đề xuất BH ngay. Khách ${fullName} có nhu cầu nhưng chưa sẵn sàng. Mục tiêu: xây dựng nhận thức, chờ điểm sẵn sàng cải thiện.`,
    {
      phone: {
        view: 'educate_content',
        customer: { name: fullName },
      },
      reasoning: {
        action: 'Educate & Nurture',
        rationale: 'Need present but readiness building → nurture first',
        content: 'Bài viết: "Bảo vệ gia đình trước rủi ro y tế — 5 điều cần biết"',
      },
    }
  );
}

function actionMicroSaving(customerId, label) {
  const info = buildContext(customerId);
  const fullName = info?.fullName || customerId;
  return scene('action_microsaving',
    `${label} · Action: Micro-saving`,
    `NEXA đề xuất Micro-saving pathway: tự động round-up 50-100k mỗi giao dịch → tích lũy → đủ khả năng chi trả BH Basic sau 3-6 tháng. Giảm ma sát, không yêu cầu cam kết tài chính lớn ngay.`,
    {
      phone: {
        view: 'micro_saving',
        customer: { name: fullName },
      },
      reasoning: {
        action: 'Micro-saving pathway',
        rationale: 'High need + Low readiness → affordability pathway',
        mechanism: 'Round-up each transaction → save 50-100k → build to insurance',
      },
    }
  );
}

function actionSuppress(label) {
  return scene('action_suppress',
    `${label} · Action: Suppress`,
    `NEXA chọn Suppress — không can thiệp lúc này. Lên lịch re-score sau 90 ngày. Tránh làm phiền khách hàng khi không có nhu cầu hoặc chưa sẵn sàng.`,
    {
      reasoning: {
        action: 'Suppress',
        nextReassessment: '90 days',
      },
    }
  );
}

// ─── CUSTOMER RESPONSE scenes ────────────────────────────────────────
function customerRefuses(customerId, label) {
  const info = buildContext(customerId);
  const fullName = info?.fullName || customerId;
  return [
    scene('customer_event',
      `${label} · Khách hàng từ chối`,
      `Khách hàng ${fullName} từ chối đề xuất một cách rõ ràng, trực tiếp: "Không, cảm ơn. Tôi chưa cần lúc này."`,
      {
        phone: { view: 'customer_refuse', customer: { name: fullName } },
        data: { response: 'refused_explicit' },
      }
    ),
    scene('observation',
      `${label} · Quan sát sau hành động`,
      `Khách hàng từ chối rõ ràng. Bằng chứng: explicit refusal. Agent không được tiếp tục bán — tiếp tục ép bán sẽ gây phản cảm và vi phạm nguyên tắc tôn trọng khách hàng.`,
      {
        reasoning: {
          observation: 'Customer refused explicitly',
          signal: 'refused_explicit',
          implication: 'Do not repeat same offer',
        },
      }
    ),
    scene('replanning',
      `${label} · Re-planning`,
      `Trạng thái khách đã thay đổi: từ "chưa tiếp cận" sang "đã từ chối". Phương án can thiệp trước (Offer Insurance) không còn phù hợp. Agent thay đổi chiến thuật: không đề xuất lại, chuyển sang Educate & Nurture, lên lịch reassess.`,
      {
        reasoning: {
          stateChanged: true,
          priorAction: 'Offer Insurance — no longer appropriate',
          newStrategy: 'Educate & Nurture + schedule reassess',
          questions: [
            'Trạng thái khách đã thay đổi? → Có (refused)',
            'Phương án trước còn phù hợp? → Không',
            'Cần công cụ khác? → Không — dùng nurture',
            'Phương án tiếp theo thay đổi? → Có — Educate & Nurture',
          ],
        },
      }
    ),
    scene('next_action',
      `${label} · Next Action: Reassess later`,
      `Agent chọn Reassess later — lên lịch đánh giá lại sau 30 ngày. Không tự ý recommend lại. Chuyển sang Educate & Nurture trong khoảng thời gian chờ.`,
      {
        reasoning: {
          nextAction: 'Reassess later',
          schedule: '30 days',
          loopState: 'WAITING',
          behavior: 'Schedule re-score, auto-trigger at date, do not repeat offer',
        },
      }
    ),
  ];
}

function customerAgrees(customerId, label) {
  const info = buildContext(customerId);
  const fullName = info?.fullName || customerId;
  return [
    scene('customer_event',
      `${label} · Khách hàng đồng ý`,
      `Khách hàng ${fullName} đồng ý tham gia: "Đồng ý, tôi muốn tham gia." Explicit positive intent.`,
      {
        phone: { view: 'customer_accept', customer: { name: fullName } },
        data: { response: 'accepted' },
      }
    ),
    scene('observation',
      `${label} · Quan sát sau hành động`,
      `Khách hàng đồng ý rõ ràng. Explicit positive intent detected. Agent proceed to enrollment.`,
      {
        reasoning: {
          observation: 'Customer accepted',
          signal: 'accepted',
          implication: 'Proceed to enrollment/activation',
        },
      }
    ),
  ];
}

// ─── TIME PASS / NURTURE scene ───────────────────────────────────────
function timePass(days, label) {
  return scene('time_pass',
    `${label} · T+${days} ngày — Không có event mới`,
    `Sau ${days} ngày, không có event mới từ khách hàng. Không có evidence mới hoặc evidence không đủ mạnh. Agent không tự ý recommend lại — tiếp tục Educate & Nurture.`,
    {
      reasoning: {
        daysPassed: days,
        newEvents: 0,
        rule: 'No new evidence → do not auto-recommend → Educate & Nurture',
      },
    }
  );
}

// ─── NEW EVENT at T+x ────────────────────────────────────────────────
function newEvent(customerId, eventDesc, overrides, label) {
  const info = buildContext(customerId, overrides);
  const fullName = info?.fullName || customerId;
  return scene('customer_event',
    `${label} · Khách mở app + giao dịch mới`,
    eventDesc,
    {
      phone: {
        view: 'new_transaction',
        customer: { name: fullName },
        event: overrides,
      },
      reasoning: {
        event: eventDesc,
        newSignals: overrides,
      },
    }
  );
}

// ─── GCNBH scene ─────────────────────────────────────────────────────
function gcnbhScene(customerId, result, label) {
  const info = buildContext(customerId);
  const fullName = info?.fullName || customerId;
  const ctx = info?.ctx;
  const product = result?.product || {};
  const premium = ctx?.recommended_premium_vnd || 0;
  const productName = product.product_name ? `${product.product_name}${product.tier_name ? ' — ' + product.tier_name : ''}` : 'Bảo hiểm';

  return scene('gcnbh',
    `${label} · GCNBH — Xác nhận tham gia`,
    `Giấy chứng nhận dự kiến bảo hiểm xuất hiện. Khách hàng ${fullName} xem và xác nhận tham gia ${productName}. Phí ${vnd(premium)}/năm. Màn hình scroll để khách hàng kiểm tra điều khoản và bấm xác nhận.`,
    {
      phone: {
        view: 'gcnbh',
        customer: { name: fullName, id: customerId, age: ctx?.age, income: ctx?.monthly_income_trVND },
        product: { name: productName, premium: vnd(premium), productId: product.product_id, tier: product.tier_name },
      },
      reasoning: {
        action: 'Enrollment / Activation',
        product: productName,
        premium: vnd(premium) + '/năm',
        gcnbh: 'Giấy chứng nhận dự kiến — khách xác nhận đăng ký',
      },
      tapAction: { label: 'Cuộn đến xác nhận ↓', target: 'gcnbh_confirm' },
      duration: 6.0,
    }
  );
}

function terminateScene(label) {
  return scene('terminate',
    `${label} · TERMINATE — Mục tiêu hoàn thành`,
    `Khách hàng đã tham gia bảo hiểm. Mục tiêu hoàn thành. Agent TERMINATE — dừng mọi automation, log kết quả. Không over-contact.`,
    {
      reasoning: {
        loopState: 'TERMINATE — Goal achieved',
        nextAction: 'TERMINATE',
      },
    }
  );
}

// Reset scene counter for a fresh scenario
function resetScenes() { _sceneId = 0; }

module.exports = {
  runAssessment,
  actionOfferInsurance,
  actionEducateNurture,
  actionMicroSaving,
  actionSuppress,
  customerRefuses,
  customerAgrees,
  timePass,
  newEvent,
  gcnbhScene,
  terminateScene,
  resetScenes,
  buildContext,
  vnd,
  tr,
};
