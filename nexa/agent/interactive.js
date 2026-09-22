// agent/interactive.js — Interactive transaction-driven agent
// Customer makes a transaction → agent analyzes → suggests insurance → handles accept/refuse

const {
  computeProtectionNeed,
  computeProtectionReadiness,
  queryProductKB,
  computeEvidenceStrength,
  evaluateDecisionGate,
} = require('./tools');
const dataLoader = require('../data-loader');

// ─── Transaction types ──────────────────────────────────────────────
const TRANSACTION_TYPES = {
  transfer_relative: {
    label: 'Chuyển tiền cho người thân',
    icon: '💸',
    desc: 'Chuyển tiền cho người thân',
    contextChanges: (amount) => ({
      transfer_count_month: '+1',
      tx_per_month: '+1',
      _signal: 'family_support',
      _amount: amount,
    }),
  },
  hospital_fee: {
    label: 'Thanh toán viện phí',
    icon: '🏥',
    desc: 'Thanh toán chi phí y tế / viện phí',
    contextChanges: (amount) => ({
      recent_medical_event: 1,
      healthcare_spending_kVND: '+' + amount,
      tx_per_month: '+1',
      _signal: 'medical_event',
      _amount: amount,
    }),
  },
  tuition_fee: {
    label: 'Thanh toán học phí',
    icon: '🎓',
    desc: 'Chuyển tiền thanh toán học phí',
    contextChanges: (amount) => ({
      transfer_count_month: '+1',
      tx_per_month: '+1',
      _signal: 'dependents',
      _amount: amount,
    }),
  },
  qr_payment: {
    label: 'Quét QR thanh toán',
    icon: '📱',
    desc: 'Thanh toán bằng QR code',
    contextChanges: (amount) => ({
      qr_payment_count_month: '+1',
      tx_per_month: '+1',
      _signal: 'daily_spending',
      _amount: amount,
    }),
  },
  savings_deposit: {
    label: 'Gửi tiết kiệm',
    icon: '💰',
    desc: 'Gửi tiền vào tài khoản tiết kiệm',
    contextChanges: (amount) => ({
      savings_product: 1,
      balance_end_month_trVND: '+' + (amount / 1000000).toFixed(2),
      savings_deposit_count_month: '+1',
      _signal: 'saving_behavior',
      _amount: amount,
    }),
  },
  view_insurance: {
    label: 'Xem trang bảo hiểm',
    icon: '🛡️',
    desc: 'Tìm hiểu sản phẩm bảo hiểm trên app',
    contextChanges: () => ({
      insurance_page_views_month: '+1',
      _signal: 'insurance_interest',
    }),
  },
};

// ─── Refusal reasons ────────────────────────────────────────────────
const REFUSAL_REASONS = [
  { id: 'not_now', label: 'Chưa cần lúc này', icon: '⏳' },
  { id: 'too_expensive', label: 'Phí cao quá', icon: '💸' },
  { id: 'no_trust', label: 'Không tin tưởng bảo hiểm', icon: '🤔' },
  { id: 'has_other', label: 'Đã có bảo hiểm khác', icon: '✅' },
  { id: 'need_more_info', label: 'Cần tìm hiểu thêm', icon: '📚' },
  { id: 'want_human', label: 'Muốn gặp tư vấn viên', icon: '👤' },
];

// ─── Apply context changes ──────────────────────────────────────────
function applyChanges(baseCtx, changes) {
  const ctx = { ...baseCtx };
  for (const [key, val] of Object.entries(changes)) {
    if (key.startsWith('_')) continue;
    if (typeof val === 'string' && val.startsWith('+')) {
      const delta = parseFloat(val.slice(1));
      ctx[key] = (ctx[key] || 0) + delta;
    } else {
      ctx[key] = val;
    }
  }
  ctx._recomputed = true;
  return ctx;
}

// ─── Transactions that trigger insurance suggestions ───────────────
const SUGGESTION_TRIGGERS = new Set(['hospital_fee', 'tuition_fee', 'transfer_relative']);

// ─── Analyze a transaction ──────────────────────────────────────────
function analyzeTransaction(customerId, txType, amount) {
  const { full, profile } = dataLoader.getCustomer(customerId);
  if (!full) return { error: 'Customer not found' };

  const txDef = TRANSACTION_TYPES[txType];
  if (!txDef) return { error: 'Unknown transaction type' };

  // Get customer name and infer pronoun (Vietnamese)
  const customerName = profile?.['Tên KH'] || customerId;
  const customerPronoun = customerName.includes('Thị') ? 'Chị' : customerName.includes('Văn') ? 'Anh' : 'Chị';

  // Apply transaction to context
  const changes = txDef.contextChanges(amount || 0);
  const newCtx = applyChanges(full, changes);

  // Run tools
  const need = computeProtectionNeed(newCtx);
  const readiness = computeProtectionReadiness(newCtx);
  const products = dataLoader.getProducts();
  const productDecision = queryProductKB(need.level, readiness.level, readiness.subScores.affordability.raw, products, full.age || 30);

  // Override product with sheet 3 recommendation (authoritative mapping)
  const sheet3Product = dataLoader.getRecommendedProduct(customerId);
  if (sheet3Product) {
    productDecision.product = sheet3Product;
  }

  const evidence = computeEvidenceStrength(newCtx, need, readiness);
  const gate = evaluateDecisionGate(evidence, need, readiness, productDecision.product);

  // Look up actual premium from premium table (sheet 08)
  let premiumVND = null;
  if (productDecision.product && productDecision.product.product_id) {
    const prem = dataLoader.lookupPremium(
      productDecision.product.product_id,
      productDecision.product.tier_name,
      full.age || 30,
      full.gender || 'Nam'
    );
    if (prem) premiumVND = prem.annual_premium_vnd;
  }

  // Determine signal description
  const signalDesc = {
    family_support: 'chuyển tiền cho người thân — có thể đang hỗ trợ gia đình',
    medical_event: 'thanh toán viện phí — rủi ro y tế đang hiện hữu',
    dependents: 'thanh toán học phí — có người phụ thuộc',
    daily_spending: 'giao dịch hàng ngày',
    saving_behavior: 'gửi tiết kiệm — hành vi tài chính tích cực',
    insurance_interest: 'xem trang bảo hiểm — đang quan tâm đến bảo vệ',
  }[changes._signal] || 'giao dịch';

  // Suppress suggestions for non-trigger transaction types
  const shouldSuggest = SUGGESTION_TRIGGERS.has(txType);

  return {
    transaction: { type: txType, label: txDef.label, icon: txDef.icon, amount: amount || 0, signal: signalDesc },
    customerName,
    customerPronoun,
    assessment: {
      need: { score: need.score, level: need.level, subScores: need.subScores },
      readiness: { score: readiness.score, level: readiness.level, subScores: readiness.subScores },
      action: shouldSuggest ? productDecision.action : 'Suppress — Not triggered',
      product: shouldSuggest ? productDecision.product : null,
      intervention: productDecision.intervention,
      evidence,
      gate,
      premiumVND,
    },
    context: {
      income: newCtx.monthly_income_trVND,
      balance: newCtx.balance_end_month_trVND,
      transferCount: newCtx.transfer_count_month,
      insuranceViews: newCtx.insurance_page_views_month,
    },
  };
}

// ─── Build NEXA message for a transaction ───────────────────────────
function buildSuggestionMessage(result) {
  const { transaction, assessment } = result;
  const product = assessment.product;
  const productName = product ? `${product.product_name}${product.tier_name ? ' — ' + product.tier_name : ''}` : null;
  const premiumVND = assessment.premiumVND || (product ? (product.annual_premium_min_vnd || product.annual_premium_max_vnd || 0) : 0);
  const premiumText = premiumVND ? `${new Intl.NumberFormat('vi-VN').format(premiumVND)}đ/năm` : '';

  // Don't suggest if action is suppress
  if (assessment.action.startsWith('Suppress')) {
    return {
      type: 'info',
      text: `Tôi nhận thấy bạn vừa ${transaction.label.toLowerCase()}. Hồ sơ của bạn đang ổn định. Tôi sẽ theo dõi và đề xuất khi phù hợp hơn.`,
      action: 'suppress',
      quickReplies: [],
    };
  }

  // Micro-saving pathway
  if (assessment.action === 'Micro-saving pathway') {
    return {
      type: 'suggest_microsave',
      text: `Tôi nhận thấy bạn vừa ${transaction.label.toLowerCase()}. Dựa trên hồ sơ tài chính của bạn, tôi có một cách bảo vệ đơn giản: **Micro-saving** — tự động làm tròn tiền mỗi giao dịch, tích lũy dần để tham gia bảo hiểm sau 3-6 tháng. Bạn có quan tâm không?`,
      action: 'micro_saving',
      quickReplies: [
        { id: 'accept_micro', label: '👍 Đồng ý thử', icon: '👍' },
        { id: 'refuse', label: 'Không, cảm ơn', icon: '👎' },
      ],
    };
  }

  // Hospital fee — professional messaging
  if (transaction.type === 'hospital_fee') {
    const productLink = productName ? `«${productName}»` : '[Link sản phẩm bảo hiểm]';
    const msgs = [
      `NEXA nhận thấy một khoảng trống bảo vệ. Khách hàng vừa phát sinh chi phí y tế và chưa có bảo hiểm sức khỏe tương ứng. Xem ${productLink} có thể giúp giảm áp lực chi phí y tế trong tương lai.`,
      `Chủ động bảo vệ trước những chi phí y tế bất ngờ. Khách hàng vừa phát sinh chi phí tại bệnh viện. NEXA nhận thấy bạn có nhu cầu bảo vệ sức khỏe đáng cân nhắc — xem thử quyền lợi phù hợp với mình tại ${productLink}.`,
    ];
    const text = msgs[Math.floor(Math.random() * msgs.length)];
    return {
      type: 'suggest_insurance',
      text,
      action: 'offer_insurance',
      product: productName ? { name: productName, premium: premiumText } : null,
      quickReplies: [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'refuse', label: '❌ Không, cảm ơn', icon: '❌' },
      ],
    };
  }

  // Educate & Nurture
  if (assessment.action === 'Educate & Nurture') {
    const productLink = productName ? `«${productName}»` : 'bảo hiểm';
    return {
      type: 'suggest_educate',
      text: `Tôi nhận thấy bạn vừa ${transaction.label.toLowerCase()}. Bạn có nhu cầu bảo vệ nhưng có thể cần thêm thời gian. Tôi gửi bạn thông tin về ${productLink} — bạn có muốn xem chi tiết không?`,
      action: 'educate',
      product: productName ? { name: productName, premium: premiumText } : null,
      quickReplies: [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'refuse', label: '❌ Từ chối', icon: '❌' },
      ],
    };
  }

  // Offer Insurance (non-hospital)
  if (assessment.action === 'Offer Insurance' && productName) {
    const productLink = `«${productName}»`;
    return {
      type: 'suggest_insurance',
      text: `🛡️ Tôi nhận thấy bạn vừa ${transaction.label.toLowerCase()}. Dựa trên hồ sơ của bạn (nhu cầu bảo vệ: ${assessment.need.level}, sẵn sàng: ${assessment.readiness.level}), tôi đề xuất ${productLink}${premiumText ? ' — phí khoảng ' + premiumText : ''}. Bạn có muốn tìm hiểu không?`,
      action: 'offer_insurance',
      product: { name: productName, premium: premiumText },
      quickReplies: [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'refuse', label: '❌ Không, cảm ơn', icon: '❌' },
      ],
    };
  }

  return { type: 'info', text: 'Tôi đang phân tích giao dịch của bạn...', action: 'none', quickReplies: [] };
}

// ─── Handle refusal ─────────────────────────────────────────────────
function handleRefusal(reasonId, product) {
  const reason = REFUSAL_REASONS.find(r => r.id === reasonId);
  const productName = product?.name || 'bảo hiểm';

  const responses = {
    not_now: {
      text: `Tôi hiểu — lúc này chưa phải thời điểm phù hợp. Tôi sẽ theo dõi tình hình tài chính của bạn và đề xuất lại khi phù hợp hơn. Trong lúc đó, bạn có thể xem bài viết "5 điều cần biết về bảo hiểm y tế" khi rảnh.`,
      action: 'educate_nurture',
      nextStep: 'schedule_reassess',
      quickReplies: [{ id: 'view_educate', label: '📖 Xem bài viết', icon: '📖' }, { id: 'close', label: 'Để sau', icon: '👋' }],
    },
    too_expensive: {
      text: `Tôi hiểu — phí bảo hiểm có thể là khoản chi lớn. Nhưng bạn có thể bắt đầu nhỏ: **Micro-saving** — tự động tròn tiền mỗi giao dịch (50-100k), tích lũy dần. Sau 3-6 tháng bạn sẽ đủ khả năng tham gia. Bạn muốn thử không?`,
      action: 'micro_saving',
      nextStep: 'offer_microsave',
      quickReplies: [{ id: 'accept_micro', label: '🪙 Đồng ý thử micro-saving', icon: '🪙' }, { id: 'close', label: 'Để sau', icon: '👋' }],
    },
    no_trust: {
      text: `Tôi hiểu lo ngại của bạn. Nhiều người cũng từng cảm thấy như vậy. ${productName} được cung cấp bởi đối tác bảo hiểm uy tín, có giấy phép từ Bộ Tài chính. Bạn có thể xem thông tin chi tiết về quyền lợi và điều khoản trước khi quyết định.`,
      action: 'build_trust',
      nextStep: 'show_details',
      quickReplies: [{ id: 'view_details', label: '📋 Xem chi tiết', icon: '📋' }, { id: 'close', label: 'Để sau', icon: '👋' }],
    },
    has_other: {
      text: `Tốt! Bạn đã có bảo hiểm — đó là quyết định khôn ngoan. Tôi sẽ không đề xuất thêm lúc này. Nếu cần so sánh hoặc bổ sung bảo vệ trong tương lai, tôi luôn sẵn sàng.`,
      action: 'suppress',
      nextStep: 'terminate',
      quickReplies: [{ id: 'close', label: '👋 Cảm ơn', icon: '👋' }],
    },
    need_more_info: {
      text: `Tất nhiên! Đây là thông tin về ${productName}:\n\n• Quyền lợi: chi trả viện phí, phẫu thuật, bệnh hiểm nghèo\n• Thời gian chờ: 30 ngày (90 ngày cho bệnh có sẵn)\n• Bạn có thể hủy trong 15 ngày nếu không hài lòng\n\nBạn muốn xem thêm gì?`,
      action: 'educate',
      nextStep: 'more_info',
      quickReplies: [{ id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' }, { id: 'close', label: 'Để sau', icon: '👋' }],
    },
    want_human: {
      text: `Tôi sẽ kết nối bạn với chuyên viên tư vấn của MSB. Họ sẽ liên hệ trong vòng 24 giờ để hỗ trợ bạn chi tiết hơn. Cảm ơn bạn đã quan tâm!`,
      action: 'escalate_human',
      nextStep: 'escalate',
      quickReplies: [{ id: 'close', label: '👋 Cảm ơn', icon: '👋' }],
    },
  };

  return responses[reasonId] || responses.not_now;
}

// ─── Handle acceptance ──────────────────────────────────────────────
function handleAcceptance(customerId, product) {
  const { full } = dataLoader.getCustomer(customerId);
  const productName = product?.name || 'bảo hiểm';
  const premium = product?.premium || '';

  return {
    text: `Tuyệt vời! 🎉 Tôi sẽ khởi tạo đăng ký **${productName}** cho bạn.${premium ? ' Phí: ' + premium + '.' : ''} Vui lòng kiểm tra Giấy chứng nhận dự kiến (GCNBH) bên dưới và xác nhận để hoàn tất.`,
    action: 'enroll',
    nextStep: 'gcnbh',
    gcnbh: {
      customer: {
        name: full ? dataLoader.getCustomer(customerId).profile?.['Tên KH'] : customerId,
        id: customerId,
        age: full?.age,
        income: full?.monthly_income_trVND,
      },
      product: { name: productName, premium },
    },
  };
}

// ─── Compare insurance products for a customer ─────────────────────
function compareProducts(customerId) {
  const { full, profile } = dataLoader.getCustomer(customerId);
  if (!full) return { error: 'Customer not found' };

  const income = (full.monthly_income_trVND || 0) * 1000000;
  const balance = (full.balance_end_month_trVND || 0) * 1000000;
  const debt = (full.monthly_debt_trVND || 0) * 1000000;
  const healthcareSpending = (full.healthcare_spending_kVND || 0) * 1000;
  const hasSavings = full.savings_product || 0;
  const stress = full.financial_stress_1to5 || 3;
  const age = full.age || 30;
  const gender = (profile?.['Tên KH'] || '').includes('Thị') ? 'Nữ' : 'Nam';

  const liquidity = balance - debt;
  const monthlyDisposable = income - debt - healthcareSpending;
  const annualIncome = income * 12;

  const products = dataLoader.getProducts();
  const healthProducts = products.filter(p => p.category && p.category.includes('Sức khỏe'));

  const comparisons = healthProducts.map(p => {
    const prem = dataLoader.lookupPremium(p.product_id, p.tier_name, age, gender);
    const premium = prem ? prem.annual_premium_vnd : (p.min_premium_vnd || p.annual_premium_min_vnd || 0);

    const pctOfIncome = income > 0 ? (premium / annualIncome) * 100 : 999;
    const pctOfSavings = balance > 0 ? (premium / balance) * 100 : 999;
    const liquidityMonths = premium > 0 ? liquidity / (premium / 12) : 999;
    const disposableCover = monthlyDisposable > 0 ? (premium / 12) / monthlyDisposable * 100 : 999;

    let rating, ratingColor, recommendation;
    if (pctOfIncome <= 2 && liquidityMonths >= 12) {
      rating = 'Rất phù hợp'; ratingColor = '#43a047';
      recommendation = 'Phí rất nhẹ so với thu nhập, dư dả thanh toán.';
    } else if (pctOfIncome <= 5 && liquidityMonths >= 6) {
      rating = 'Phù hợp'; ratingColor = '#4caf50';
      recommendation = 'Khả năng chi trả tốt, nên cân nhắc tham gia.';
    } else if (pctOfIncome <= 10 && liquidityMonths >= 3) {
      rating = 'Khó khăn'; ratingColor = '#ff9800';
      recommendation = 'Phí chiếm tỷ trọng lớn, cần lên kế hoạch tài chính.';
    } else {
      rating = 'Không phù hợp'; ratingColor = '#f44336';
      recommendation = 'Vượt quá khả năng chi trả hiện tại, nên xem gói thấp hơn.';
    }

    return {
      product_id: p.product_id,
      product_name: p.product_name,
      tier_name: p.tier_name,
      provider: p.provider,
      category: p.category,
      premium,
      pctOfIncome: Math.round(pctOfIncome * 10) / 10,
      pctOfSavings: Math.round(pctOfSavings * 10) / 10,
      liquidityMonths: Math.round(liquidityMonths * 10) / 10,
      disposableCover: Math.round(disposableCover * 10) / 10,
      rating, ratingColor, recommendation,
    };
  });

  comparisons.sort((a, b) => a.pctOfIncome - b.pctOfIncome);

  return {
    customer: {
      name: profile?.['Tên KH'] || customerId,
      pronoun: (profile?.['Tên KH'] || '').includes('Thị') ? 'Chị' : 'Anh',
      age, income, balance, debt, liquidity, monthlyDisposable, hasSavings, stress,
    },
    products: comparisons,
  };
}

module.exports = {
  TRANSACTION_TYPES,
  REFUSAL_REASONS,
  analyzeTransaction,
  buildSuggestionMessage,
  handleRefusal,
  handleAcceptance,
  compareProducts,
};
