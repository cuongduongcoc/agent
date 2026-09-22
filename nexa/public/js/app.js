// app.js — NEXA × MSB: Full interactive app simulation
// User navigates MSB app, makes transactions → NEXA watches & suggests insurance

const $ = (id) => document.getElementById(id);

// ─── App State ───────────────────────────────────────────────────────
const state = {
  customer: null,
  balance: 0,              // current balance in VND
  transactions: [],         // transaction history
  chatMessages: [],         // NEXA chat messages
  quickReplies: [],         // current quick reply options
  screen: 'home',           // current app screen
  navTab: 'home',           // active bottom nav
  nexaBadge: 0,             // unread NEXA messages
  insuranceViews: 0,        // insurance page views count
  hasSuggested: false,      // NEXA has already suggested in this session
  customerRefused: false,   // customer refused insurance
  refusalReason: null,      // why customer refused
  enrolledProduct: null,    // product customer enrolled in
  agentLog: [],             // agent reasoning log
  lastAssessment: null,     // last assessment result
  currentProduct: null,     // product being offered
  tab: 'reasoning',         // reasoning panel tab
};

let customers = [];
let products = [];

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  try {
    const [cRes, pRes] = await Promise.all([
      fetch('/api/demo-customers').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
    ]);
    customers = cRes;
    products = pRes;

    const sel = $('customerSelect');
    customers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} · ${c.id}`;
      sel.appendChild(opt);
    });
    sel.value = 'VN00005';
    sel.onchange = () => selectCustomer(sel.value);
  } catch (e) {
    console.error('Init error:', e);
    return;
  }
  await selectCustomer('VN00005');
}

// ─── Select customer ─────────────────────────────────────────────────
async function selectCustomer(id) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  const full = await fetch(`/api/customer/${id}`).then(r => r.json());
  state.customer = { ...c, full: full.full, profile: full.profile };
  state.balance = (full.full.monthly_income_trVND || 10) * 1000000 * 0.3; // estimate balance
  state.transactions = [];
  state.chatMessages = [];
  state.quickReplies = [];
  state.screen = 'home';
  state.navTab = 'home';
  state.nexaBadge = 0;
  state.insuranceViews = 0;
  state.hasSuggested = false;
  state.customerRefused = false;
  state.refusalReason = null;
  state.enrolledProduct = null;
  state.agentLog = [];
  state.lastAssessment = null;
  state.currentProduct = null;

  // NEXA welcome message
  addChatMessage('bot', `Xin chào ${c.name}! 👋 Tôi là NEXA, trợ lý tài chính MSB. Tôi sẽ đồng hành cùng bạn trong mỗi giao dịch và gợi ý bảo vệ phù hợp. Chúc bạn trải nghiệm tốt!`);

  renderApp();
  renderReasoning();
}

// ─── App Renderer ───────────────────────────────────────────────────
function renderApp() {
  const el = $('phoneScreen');
  const screen = state.screen;

  let content = '';
  switch (screen) {
    case 'home': content = screenHome(); break;
    case 'transfer': content = screenTransfer(); break;
    case 'qr': content = screenQR(); break;
    case 'insurance': content = screenInsurance(); break;
    case 'insurance_detail': content = screenInsuranceDetail(); break;
    case 'savings': content = screenSavings(); break;
    case 'nexa_chat': content = screenNexaChat(); break;
    case 'gcnbh': content = screenGCNBH(); break;
    case 'success': content = screenSuccess(); break;
    case 'tx_result': content = screenTxResult(); break;
    case 'tx_detail': content = screenTxDetail(); break;
    default: content = screenHome();
  }

  el.innerHTML = content;

  // Add floating NEXA bot icon (hide when already in chat)
  if (screen !== 'nexa_chat') {
    const fab = document.createElement('div');
    fab.className = 'nexa-fab';
    fab.innerHTML = `<img src="assets/icon.png" alt="NEXA" onclick="navTo('nexa_chat')">
      ${state.nexaBadge > 0 ? `<span class="fab-badge">${state.nexaBadge}</span>` : ''}
      <span class="fab-pulse"></span>`;
    el.appendChild(fab);
  }

  // Scroll chat to bottom
  if (screen === 'nexa_chat') {
    const cm = el.querySelector('.chat-messages');
    if (cm) cm.scrollTop = cm.scrollHeight;
  }
}

// ─── Screens ────────────────────────────────────────────────────────

function appShell(header, body, nav = true) {
  const navHTML = nav ? bottomNav() : '';
  return `<div class="app">
    <div class="app-statusbar">
      <span class="time">${new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'})}</span>
      <span class="icons">📶 🔋</span>
    </div>
    ${header}
    <div class="app-body">${body}</div>
    ${navHTML}
  </div>`;
}

function bottomNav() {
  const tabs = [
    { id: 'home', icon: '🏠', label: 'Trang chủ' },
    { id: 'transfer', icon: '💸', label: 'Giao dịch' },
    { id: 'savings', icon: '💰', label: 'Tiết kiệm' },
    { id: 'insurance', icon: '🛡️', label: 'Bảo hiểm' },
  ];
  return `<div class="app-nav">${tabs.map(t => `
    <div class="nav-item ${state.navTab === t.id ? 'active' : ''}" onclick="navTo('${t.id}')">
      <span class="nav-icon">${t.icon}</span>${t.label}
    </div>`).join('')}</div>`;
}

function screenHome() {
  const c = state.customer;
  const recentTx = state.transactions.slice(0, 5);
  return appShell(
    `<div class="app-header"><span class="title">MSB Mobile</span><span class="action">🔔</span></div>`,
    `<div class="home-greeting">
      <div class="hello">Xin chào,</div>
      <div class="name">${c?.name || ''}</div>
    </div>
    <div class="balance-card">
      <div class="b-label">Số dư khả dụng</div>
      <div class="b-amount">${vnd(state.balance)}</div>
      <div class="b-sub"><span>Tài khoản thanh toán</span><span>VN${c?.id?.slice(2) || '00000'}</span></div>
    </div>
    <div class="quick-actions">
      <div class="qa-item" onclick="navTo('transfer')"><span class="qa-icon">💸</span>Chuyển tiền</div>
      <div class="qa-item" onclick="navTo('qr')"><span class="qa-icon">📱</span>Quét QR</div>
      <div class="qa-item" onclick="navTo('savings')"><span class="qa-icon">💰</span>Tiết kiệm</div>
      <div class="qa-item" onclick="navTo('insurance')"><span class="qa-icon">🛡️</span>Bảo hiểm</div>
    </div>
    ${state.nexaBadge > 0 ? nexaHomeCard() : ''}
    <div class="section-header">
      <span class="sh-title">Giao dịch gần đây</span>
      ${state.transactions.length > 0 ? '<span class="sh-link" onclick="navTo(\'transfer\')">Xem tất cả</span>' : ''}
    </div>
    <div class="tx-list">
      ${recentTx.length > 0 ? recentTx.map(txRow).join('') : '<div style="text-align:center;padding:20px;color:#999;font-size:12px;">Chưa có giao dịch. Thử chuyển tiền hoặc quét QR!</div>'}
    </div>`
  );
}

function nexaHomeCard() {
  const lastMsg = state.chatMessages.filter(m => m.sender === 'bot').slice(-1)[0];
  return `<div class="nexa-card" onclick="navTo('nexa_chat')">
    <img src="assets/icon.png" class="nc-icon">
    <div class="nc-info">
      <div class="nc-title">NEXA · ${state.nexaBadge} tin nhắn mới</div>
      <div class="nc-text">${lastMsg ? lastMsg.text.slice(0, 50) + '...' : 'Bạn có tin nhắn mới'}</div>
    </div>
    <span class="nc-arrow">›</span>
  </div>`;
}

function txRow(tx) {
  return `<div class="tx-row">
    <div class="tx-icon ${tx.type}">${tx.icon}</div>
    <div class="tx-info">
      <div class="tx-name">${tx.label}</div>
      <div class="tx-time">${tx.time}</div>
    </div>
    <div class="tx-amount ${tx.amount > 0 ? 'in' : 'out'}">${tx.amount > 0 ? '+' : ''}${vnd(Math.abs(tx.amount))}</div>
  </div>`;
}

// Transfer screen
function screenTransfer() {
  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('home')">←</span><span class="title">Chuyển tiền</span></div>`,
    `<div class="form-group">
      <div class="form-label">Người nhận</div>
      <div class="recipient-list">
        <div class="recipient-item" onclick="selectRecipient('Nguyễn Thị Lan', 'Chị/em')">
          <div class="ri-avatar" style="background:#e91e63">L</div>
          <div><div class="ri-name">Nguyễn Thị Lan</div><div class="ri-detail">0123456789 · Chị/em</div></div>
        </div>
        <div class="recipient-item" onclick="selectRecipient('Trần Văn Nam', 'Anh/em')">
          <div class="ri-avatar" style="background:#2196f3">N</div>
          <div><div class="ri-name">Trần Văn Nam</div><div class="ri-detail">0987654321 · Anh/em</div></div>
        </div>
        <div class="recipient-item" onclick="selectRecipient('Lê Thị Mai', 'Mẹ')">
          <div class="ri-avatar" style="background:#4caf50">M</div>
          <div><div class="ri-name">Lê Thị Mai</div><div class="ri-detail">0369852147 · Mẹ</div></div>
        </div>
        <div class="recipient-item" onclick="selectRecipient('BV Việt Đức', 'Viện phí')">
          <div class="ri-avatar" style="background:#f44336">V</div>
          <div><div class="ri-name">BV Việt Đức</div><div class="ri-detail">0192837465 · Thanh toán viện phí</div></div>
        </div>
        <div class="recipient-item" onclick="selectRecipient('ĐH Bách Khoa', 'Học phí')">
          <div class="ri-avatar" style="background:#ff9800">Đ</div>
          <div><div class="ri-name">ĐH Bách Khoa</div><div class="ri-detail">0192837465 · Thanh toán học phí</div></div>
        </div>
      </div>
    </div>`
  );
}

// QR payment screen
function screenQR() {
  const purpose = state._transferPurpose || 'qr_payment';
  const purposes = [
    { id: 'qr_payment', icon: '🛒', label: 'Mua sắm' },
    { id: 'hospital_fee', icon: '🏥', label: 'Viện phí' },
    { id: 'tuition_fee', icon: '🎓', label: 'Học phí' },
    { id: 'qr_payment', icon: '🍽️', label: 'Ăn uống' },
    { id: 'qr_payment', icon: '💼', label: 'Khác' },
  ];
  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('home')">←</span><span class="title">Quét QR thanh toán</span></div>`,
    `<div style="text-align:center;padding:30px 20px;">
      <img src="assets/qr-code.png" style="width:180px;height:180px;margin:0 auto;border-radius:12px;border:8px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
      <div style="font-size:13px;color:#666;margin-top:16px;">Đang quét mã QR...</div>
      <div style="font-size:11px;color:#999;margin-top:4px;">Đặt mã QR trong khung để quét tự động</div>
    </div>
    <div class="form-group">
      <div class="form-label">Mục đích</div>
      <div class="purpose-chips">
        ${purposes.map(p => `<button class="purpose-chip ${purpose === p.id && p.label === (state._transferLabel||'') ? 'active' : ''}" onclick="selectPurpose('${p.id}','${p.label}','${p.icon}')">${p.icon} ${p.label}</button>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <div class="form-label">Số tiền</div>
      <input type="number" class="form-input" id="qrAmount" value="50000" step="10000" min="0" placeholder="Nhập số tiền">
    </div>
    <div class="form-group">
      <div class="form-label">Nội dung</div>
      <input type="text" class="form-input" id="qrNote" value="Thanh toán" placeholder="Nội dung chuyển khoản">
    </div>
    <button class="btn-primary" onclick="doQRPayment()">Xác nhận thanh toán</button>`
  );
}

// Transfer amount screen (after selecting recipient)
function screenTransferAmount() {
  const purpose = state._transferPurpose || 'transfer_relative';
  const purposes = [
    { id: 'transfer_relative', icon: '👨‍👩‍👧', label: 'Người thân' },
    { id: 'hospital_fee', icon: '🏥', label: 'Viện phí / y tế' },
    { id: 'tuition_fee', icon: '🎓', label: 'Học phí' },
    { id: 'transfer_relative', icon: '🏠', label: 'Sinh hoạt' },
    { id: 'transfer_relative', icon: '💼', label: 'Khác' },
  ];
  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('transfer')">←</span><span class="title">Chuyển tiền</span></div>`,
    `<div class="form-group">
      <div class="form-label">Người nhận</div>
      <div style="padding:12px;background:#fff;border-radius:10px;border:1px solid #eee;">
        <strong>${state._recipient?.name || ''}</strong> — ${state._recipient?.relation || ''}
      </div>
    </div>
    <div class="form-group">
      <div class="form-label">Mục đích chuyển tiền</div>
      <div class="purpose-chips">
        ${purposes.map(p => `<button class="purpose-chip ${purpose === p.id && p.label === (state._transferLabel||'') ? 'active' : ''}" onclick="selectPurpose('${p.id}','${p.label}','${p.icon}')">${p.icon} ${p.label}</button>`).join('')}
      </div>
      ${state._transferPurpose === 'hospital_fee' ? '<div style="font-size:11px;color:#e53935;margin-top:8px;padding:0 4px;">⚠️ NEXA sẽ phân tích rủi ro y tế và đề xuất bảo hiểm sức khỏe phù hợp</div>' : ''}
      ${state._transferPurpose === 'tuition_fee' ? '<div style="font-size:11px;color:#ff9800;margin-top:8px;padding:0 4px;">🎓 NEXA sẽ đề xuất bảo hiểm giáo dục / bảo vệ người phụ thuộc</div>' : ''}
    </div>
    <div class="form-group">
      <div class="form-label">Số tiền</div>
      <input type="number" class="form-input" id="txAmount" value="${state._transferPurpose === 'hospital_fee' ? '5000000' : '2000000'}" step="500000" min="0" placeholder="Nhập số tiền">
    </div>
    <div class="form-group">
      <div class="form-label">Nội dung</div>
      <input type="text" class="form-input" id="txNote" value="Chuyển tiền" placeholder="Nội dung">
    </div>
    <button class="btn-primary" onclick="doTransfer()">Xác nhận chuyển tiền</button>`
  );
}

function selectPurpose(purposeId, label, icon) {
  state._transferPurpose = purposeId;
  state._transferLabel = label;
  state._transferIcon = icon;
  renderApp();
}

// Insurance screen
function screenInsurance() {
  const kcare = products.filter(p => p.product_id === 'RP01');
  const others = products.filter(p => p.product_id !== 'RP01' && p.category && p.category.includes('Sức khỏe')).slice(0, 4);
  const insProducts = [...kcare, ...others];
  const colors = ['linear-gradient(135deg,#e85d04,#f58220)', 'linear-gradient(135deg,#e91e63,#f06292)', 'linear-gradient(135deg,#4caf50,#66bb6a)', 'linear-gradient(135deg,#ff9800,#ffb74d)'];
  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('home')">←</span><span class="title">🛡️ Bảo hiểm</span></div>`,
    `<div style="padding:12px 16px;font-size:12px;color:#666;">Sản phẩm bảo hiểm từ MSB & đối tác</div>
    ${insProducts.map((p, i) => `
      <div class="ins-product" onclick="viewInsuranceProduct('${p.product_id}','${p.tier_name}')">
        <div class="ip-cover" style="background:${colors[i % colors.length]}">
          <div class="ip-icon">🛡️</div>
          <div class="ip-name">${p.product_name}</div>
          <div class="ip-provider">${p.provider} · ${p.tier_name}</div>
        </div>
        <div class="ip-body">
          <div class="ip-benefit">${(p.key_benefits || 'Bảo vệ toàn diện').slice(0, 80)}...</div>
          <div class="ip-premium">Từ ${vnd(p.min_premium_vnd || p.annual_premium_min_vnd || 0)}/năm</div>
        </div>
      </div>
    `).join('')}
    <div style="padding:16px;font-size:11px;color:#999;text-align:center;">
      Xem thêm sản phẩm tại mục Bảo hiểm
    </div>`
  );
}

function screenInsuranceDetail() {
  const p = state._insProduct;
  if (!p) return screenInsurance();
  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('insurance')">←</span><span class="title">Chi tiết BH</span></div>`,
    `<div class="ins-detail">
      <div style="font-size:28px;">🛡️</div>
      <div class="id-title">${p.product_name}</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">${p.provider} · Hạng ${p.tier_name}</div>
      <div class="id-section">
        <div class="id-section-title">Quyền lợi chính</div>
        <div class="id-section-body">${p.key_benefits || 'Bảo vệ toàn diện trước rủi ro y tế'}</div>
      </div>
        <div class="id-section">
          <div class="id-section-title">Phí bảo hiểm</div>
          <div class="id-section-body">Từ <strong>${vnd(p.min_premium_vnd || p.annual_premium_min_vnd || 0)}/năm</strong></div>
        </div>
      <div class="id-section">
        <div class="id-section-title">Điều kiện tham gia</div>
        <div class="id-section-body">Độ tuổi: ${p.min_age || 0} - ${p.max_age || 99} tuổi<br>${p.eligibility_note || 'Không có yêu cầu đặc biệt'}</div>
      </div>
      <div class="id-section">
        <div class="id-section-title">Thời gian chờ</div>
        <div class="id-section-body">${p.waiting_period_note || '30 ngày (90 ngày cho bệnh có sẵn)'}</div>
      </div>
    </div>
    <button class="btn-primary" onclick="navTo('nexa_chat')">💬 Tư vấn với NEXA</button>`
  );
}

// Savings screen
function screenSavings() {
  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('home')">←</span><span class="title">💰 Tiết kiệm</span></div>`,
    `<div class="form-group">
      <div class="form-label">Gửi tiết kiệm</div>
      <input type="number" class="form-input" id="saveAmount" value="5000000" step="1000000" min="0" placeholder="Số tiền gửi">
    </div>
    <div class="form-group">
      <div class="form-label">Kỳ hạn</div>
      <select class="form-input" id="saveTerm">
        <option value="3">3 tháng · 3.5%/năm</option>
        <option value="6">6 tháng · 4.5%/năm</option>
        <option value="12" selected>12 tháng · 5.5%/năm</option>
      </select>
    </div>
    <button class="btn-primary" onclick="doSavingsDeposit()">Gửi tiết kiệm</button>
    <div style="padding:16px;font-size:12px;color:#666;">
      <div style="font-weight:600;margin-bottom:6px;">Sản phẩm tiết kiệm MSB</div>
      <div>• M-Sinh lời: Lãi suất hấp dẫn, rút linh hoạt</div>
      <div>• Tiết kiệm tích lũy: Tự động gửi mỗi tháng</div>
    </div>`
  );
}

// NEXA Chat screen
function screenNexaChat() {
  state.nexaBadge = 0; // clear badge when viewing
  return appShell(
    `<div class="app-header">
      <span class="back" onclick="navTo('home')">←</span>
      <img src="assets/icon.png" style="width:28px;height:28px;border-radius:8px;">
      <span class="title">NEXA Assistant</span>
      <span class="action" style="color:#4ade80;">● online</span>
    </div>`,
    `<div class="chat-screen">
      <div class="chat-messages" id="chatMessages">
        ${state.chatMessages.map(m => chatMsgHTML(m)).join('')}
      </div>
      ${state._showRefusalReasons ? `<div class="chat-quickreplies"><div class="reason-options">${refusalReasonList().map(r => `<div class="reason-opt" onclick="handleRefusal('${r.id}')"><span class="ro-icon">${r.icon}</span>${r.label}</div>`).join('')}</div></div>` : state.quickReplies.length > 0 ? `<div class="chat-quickreplies">${state.quickReplies.map(qr => `<button class="cqr-btn" onclick="handleQuickReply('${qr.id}')">${qr.icon || ''} ${qr.label}</button>`).join('')}</div>` : ''}
      <div class="chat-input-bar">
        <input type="text" class="chat-input" id="chatInput" placeholder="Nhập tin nhắn..." onkeydown="if(event.key==='Enter')sendChatMessage()">
        <button class="chat-send" onclick="sendChatMessage()">➤</button>
      </div>
    </div>`,
    false
  );
}

function chatMsgHTML(m) {
  if (m.type === 'compare') {
    const cmp = m.compare;
    const c = cmp.customer;
    return `<div class="chat-compare">
      <div class="cc-header">📊 So sánh sản phẩm bảo hiểm</div>
      <div class="cc-customer">${c.pronoun} <strong>${c.name}</strong> · ${c.age} tuổi · Thu nhập ${vnd(c.income)}/tháng · Số dư ${vnd(c.balance)}</div>
      <div class="cc-table">
        <div class="cc-row cc-row-head">
          <span class="cc-cell-name">Sản phẩm</span>
          <span class="cc-cell-premium">Phí/năm</span>
          <span class="cc-cell-pct">% thu nhập</span>
          <span class="cc-cell-liq">Đệm thanh</span>
          <span class="cc-cell-rating">Đánh giá</span>
        </div>
        ${cmp.products.map(p => `
        <div class="cc-row" onclick="navigateToProduct('${p.product_name} — ${p.tier_name}')">
          <span class="cc-cell-name">${p.product_name}<br><small>${p.tier_name}</small></span>
          <span class="cc-cell-premium">${vnd(p.premium)}</span>
          <span class="cc-cell-pct">${p.pctOfIncome}%</span>
          <span class="cc-cell-liq">${p.liquidityMonths} tháng</span>
          <span class="cc-cell-rating" style="color:${p.ratingColor};font-weight:600;">${p.rating}</span>
        </div>`).join('')}
      </div>
      <div class="cc-legend">Đệm thanh = số tháng có thể trả phí từ tiền dư (số dư - nợ). Xếp theo % thu nhập tăng dần.</div>
    </div>`;
  }
  if (m.type === 'product') {
    return `<div class="chat-product">
      <div class="cp-badge">NEXA AI · Đề xuất</div>
      <div class="cp-name">${m.product.name}</div>
      <div class="cp-premium">Phí: ${m.product.premium}</div>
      <div class="cp-benefits">${m.product.benefits || 'Bảo vệ bạn và gia đình trước rủi ro y tế'}</div>
    </div>`;
  }
  const label = m.sender === 'bot' ? '<div class="cm-label">NEXA</div>' : '';
  return `<div class="chat-msg ${m.sender}">${label}<div class="cm-text">${formatText(m.text)}</div></div>`;
}

// GCNBH screen
function screenGCNBH() {
  const c = state.customer;
  const p = state.currentProduct || {};
  const today = new Date().toLocaleDateString('vi-VN');
  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('nexa_chat')">←</span><span class="title">Giấy chứng nhận</span></div>`,
    `<div class="gcnbh">
      <div class="gcnbh-header">
        <div class="gh-icon">🛡️</div>
        <div class="gh-title">GIẤY CHỨNG NHẬN DỰ KIẾN</div>
        <div class="gh-sub">${p.name || ''}</div>
      </div>
      <table class="gcnbh-table">
        <tr><td>Khách hàng:</td><td>${c?.name || ''}</td></tr>
        <tr><td>Mã khách hàng:</td><td>${c?.id || ''}</td></tr>
        <tr><td>Tuổi:</td><td>${c?.age || ''}</td></tr>
        <tr><td>Thu nhập:</td><td>${vnd((c?.income || 0) * 1000000)}/tháng</td></tr>
        <tr><td>Sản phẩm:</td><td>${p.name || ''}</td></tr>
        <tr><td>Phí bảo hiểm:</td><td>${p.premium || ''}/năm</td></tr>
        <tr><td>Ngày cấp:</td><td>${today}</td></tr>
        <tr><td>Trạng thái:</td><td style="color:#43a047;">Chờ xác nhận</td></tr>
      </table>
      <div class="gcnbh-terms">
        📋 Điều khoản: Khách hàng có quyền xem lại điều khoản và từ chối trong 15 ngày. Hợp đồng chính thức được cấp sau khi hoàn tất thủ tục. Thời gian chờ: 30 ngày (90 ngày cho bệnh có sẵn).
      </div>
      <div class="gcnbh-stamp"><span>✓ BẢN DỰ KIẾN</span></div>
      <button class="btn-primary" style="background:#43a047;" onclick="confirmEnrollment()">✓ Xác nhận tham gia</button>
    </div>`
  );
}

// Transaction result screen — success + NEXA insurance suggestion below
function screenTxResult() {
  const tx = state._lastTx;
  if (!tx) return screenHome();
  const suggestion = state._txSuggestion;
  const c = state.customer;

  // Success header
  let html = `<div style="background:#43a047;color:#fff;padding:20px 16px;text-align:center;">
    <div style="font-size:40px;">✓</div>
    <div style="font-size:15px;font-weight:700;margin-top:6px;">Giao dịch thành công</div>
    <div style="font-size:12px;opacity:0.9;margin-top:4px;">${new Date().toLocaleString('vi-VN')}</div>
  </div>`;

  // Transaction details
  html += `<div style="background:#fff;margin:12px 16px;border-radius:14px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
    <div style="text-align:center;margin-bottom:12px;">
      <div style="font-size:22px;font-weight:700;color:#e53935;">-${vnd(tx.amount)}</div>
      <div style="font-size:12px;color:#888;margin-top:4px;">${tx.icon} ${tx.label}</div>
    </div>
    <table class="gcnbh-table">
      <tr><td>Người nhận:</td><td>${tx.recipient || '—'}</td></tr>
      <tr><td>Số tiền:</td><td style="color:#e53935;">-${vnd(tx.amount)}</td></tr>
      <tr><td>Phí giao dịch:</td><td style="color:#43a047;">Miễn phí</td></tr>
      <tr><td>Nội dung:</td><td>${tx.note || '—'}</td></tr>
      <tr><td>Số dư còn lại:</td><td style="color:#004488;font-weight:700;">${vnd(state.balance)}</td></tr>
      <tr><td>Mã GD:</td><td>MSB${Date.now().toString().slice(-8)}</td></tr>
    </table>
  </div>`;

  // NEXA insurance suggestion section
  if (suggestion) {
    if (suggestion.loading) {
      html += `<div class="tx-suggestion-loading">
        <img src="assets/icon.png" class="ts-icon">
        <div class="ts-loading-text">
          <div class="ts-pulse">NEXA đang phân tích giao dịch...</div>
          <div class="ts-dots"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    } else if (suggestion.action === 'offer_insurance' && suggestion.product) {
      html += `<div class="tx-suggestion">
        <div class="ts-header">
          <img src="assets/icon.png" class="ts-icon">
          <div class="ts-title">🛡️ NEXA gợi ý bảo vệ</div>
          <span class="ts-badge">AI</span>
        </div>
        <div class="ts-reason">${suggestion.reasonText}</div>
        <div class="ts-product-card">
          <div class="tsp-name">${suggestion.product.name}</div>
          <div class="tsp-premium">Phí: ${suggestion.product.premium}</div>
          <div class="tsp-benefits">Chi trả viện phí · Phẫu thuật · Bệnh hiểm nghèo</div>
        </div>
        <div class="ts-scores">
          <div class="ts-score"><span class="ts-sl ${suggestion.needLevel.toLowerCase()}">${suggestion.needLevel}</span> Nhu cầu: <strong>${suggestion.needScore}</strong></div>
          <div class="ts-score"><span class="ts-sl ${suggestion.readyLevel.toLowerCase()}">${suggestion.readyLevel}</span> Sẵn sàng: <strong>${suggestion.readyScore}</strong></div>
        </div>
        <div class="ts-actions">
          <button class="ts-btn ts-accept" onclick="handleQuickReply('view_details')">📋 Tìm hiểu</button>
          <button class="ts-btn ts-refuse" onclick="handleQuickReply('refuse')">❌ Không, cảm ơn</button>
        </div>
      </div>`;
    } else if (suggestion.action === 'micro_saving') {
      html += `<div class="tx-suggestion">
        <div class="ts-header">
          <img src="assets/icon.png" class="ts-icon">
          <div class="ts-title">🪙 NEXA gợi ý Micro-saving</div>
          <span class="ts-badge">AI</span>
        </div>
        <div class="ts-reason">${suggestion.reasonText}</div>
        <div class="ts-product-card">
          <div class="tsp-name">Round-up Save</div>
          <div class="tsp-premium">50-100k / giao dịch</div>
          <div class="tsp-benefits">Tự động làm tròn → tích lũy → BH Basic sau 3-6 tháng</div>
        </div>
        <div class="ts-actions">
          <button class="ts-btn ts-accept" onclick="handleQuickReply('accept_micro')">👍 Đồng ý thử</button>
          <button class="ts-btn ts-refuse" onclick="handleQuickReply('refuse')">❌ Để sau</button>
        </div>
      </div>`;
    } else if (suggestion.action === 'educate') {
      html += `<div class="tx-suggestion">
        <div class="ts-header">
          <img src="assets/icon.png" class="ts-icon">
          <div class="ts-title">🛡️ NEXA gợi ý bảo vệ</div>
          <span class="ts-badge">AI</span>
        </div>
        <div class="ts-reason">${suggestion.reasonText}</div>
        ${suggestion.product ? `<div class="ts-product-card">
          <div class="tsp-name">${suggestion.product.name}</div>
          <div class="tsp-premium">Phí: ${suggestion.product.premium || '—'}</div>
          <div class="tsp-benefits">Chi trả viện phí · Phẫu thuật · Bệnh hiểm nghèo</div>
        </div>` : ''}
        <div class="ts-scores">
          <div class="ts-score"><span class="ts-sl ${suggestion.needLevel?.toLowerCase() || 'medium'}">${suggestion.needLevel || 'Medium'}</span> Nhu cầu: <strong>${suggestion.needScore || '—'}</strong></div>
          <div class="ts-score"><span class="ts-sl ${suggestion.readyLevel?.toLowerCase() || 'low'}">${suggestion.readyLevel || 'Low'}</span> Sẵn sàng: <strong>${suggestion.readyScore || '—'}</strong></div>
        </div>
        <div class="ts-actions">
          <button class="ts-btn ts-accept" onclick="handleQuickReply('view_details')">📋 Xem chi tiết</button>
          <button class="ts-btn ts-refuse" onclick="handleQuickReply('refuse')">❌ Từ chối</button>
        </div>
      </div>`;
    } else if (suggestion.action === 'suppress') {
      html += `<div class="tx-suggestion ts-suggestion-muted">
        <div class="ts-header">
          <img src="assets/icon.png" class="ts-icon">
          <div class="ts-title" style="opacity:0.7;">NEXA · Hồ sơ ổn định</div>
        </div>
        <div class="ts-reason" style="opacity:0.7;">${suggestion.reasonText}</div>
      </div>`;
    }
  }

  // Bottom actions
  html += `<div style="padding:12px 16px;">
    <button class="btn-primary" style="background:#fff;color:#e85d04;border:1px solid #e85d04;" onclick="navTo('home')">Về trang chủ</button>
  </div>`;

  return appShell(
    `<div class="app-header"><span class="back" onclick="navTo('home')">←</span><span class="title">Kết quả giao dịch</span></div>`,
    html
  );
}

// Success screen
function screenSuccess() {
  return appShell(
    `<div class="app-header"><span class="title">Hoàn tất</span></div>`,
    `<div class="success-screen">
      <div class="ss-icon">🎉</div>
      <div class="ss-title">Tham gia bảo hiểm thành công!</div>
      <div class="ss-text">Bạn đã tham gia <strong>${state.enrolledProduct?.name || 'bảo hiểm'}</strong>. Giấy chứng nhận sẽ được gửi qua email và app trong 24 giờ. Cảm ơn bạn đã tin tưởng MSB!</div>
      <button class="btn-primary" style="margin-top:20px;" onclick="navTo('home')">Về trang chủ</button>
    </div>`
  );
}

// ─── Navigation ──────────────────────────────────────────────────────
function navTo(screen) {
  state.screen = screen;
  // Map screens to nav tabs
  const navMap = { home: 'home', transfer: 'transfer', qr: 'transfer', savings: 'savings', insurance: 'insurance', insurance_detail: 'insurance', nexa_chat: 'nexa_chat', gcnbh: 'nexa_chat', success: 'home', tx_result: 'transfer' };
  state.navTab = navMap[screen] || 'home';
  if (screen === 'nexa_chat') state.nexaBadge = 0;
  renderApp();
}

function selectRecipient(name, relation) {
  state._recipient = { name, relation };
  state.screen = 'transfer_amount';
  renderApp();
}

// ─── Transactions ───────────────────────────────────────────────────
function doTransfer() {
  const amount = parseInt(document.getElementById('txAmount')?.value || '0');
  const note = document.getElementById('txNote')?.value || '';
  if (amount <= 0 || amount > state.balance) {
    alert('Số tiền không hợp lệ');
    return;
  }
  const recipient = state._recipient;
  // Use explicitly selected purpose; fall back to inferring from recipient name
  let txType = state._transferPurpose;
  if (!txType) {
    const isHospital = recipient.name.includes('BV') || recipient.relation.includes('Viện');
    const isTuition = recipient.name.includes('ĐH') || recipient.relation.includes('Học');
    txType = isHospital ? 'hospital_fee' : isTuition ? 'tuition_fee' : 'transfer_relative';
  }
  const purposeLabel = state._transferLabel ? `${state._transferIcon || ''} ${state._transferLabel}` : '';
  const fullNote = purposeLabel ? `${recipient.name} — ${purposeLabel} — ${note}` : `${recipient.name} — ${note}`;

  executeTransaction(txType, amount, fullNote);
}

function doQRPayment() {
  const amount = parseInt(document.getElementById('qrAmount')?.value || '0');
  const note = document.getElementById('qrNote')?.value || '';
  if (amount <= 0) { alert('Số tiền không hợp lệ'); return; }
  const txType = state._transferPurpose || 'qr_payment';
  const purposeLabel = state._transferLabel ? `${state._transferIcon || ''} ${state._transferLabel}` : '';
  const fullNote = purposeLabel ? `${purposeLabel} — ${note}` : note;
  executeTransaction(txType, amount, fullNote);
}

function doSavingsDeposit() {
  const amount = parseInt(document.getElementById('saveAmount')?.value || '0');
  if (amount <= 0 || amount > state.balance) { alert('Số tiền không hợp lệ'); return; }
  executeTransaction('savings_deposit', amount, 'Gửi tiết kiệm');
}

async function executeTransaction(txType, amount, note) {
  const txDef = TX_DEFS[txType];
  if (!txDef) return;

  // Update state
  state.balance -= amount;
  if (txType === 'savings_deposit') state.balance += amount; // savings doesn't reduce balance
  const tx = {
    type: txDef.cssClass,
    icon: txDef.icon,
    label: txDef.label,
    amount: -amount,
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    note,
  };
  state.transactions.unshift(tx);

  // Store last transaction for result screen
  state._lastTx = { ...tx, recipient: note.split(' — ')[0] || note, amount: Math.abs(tx.amount) };
  state._txSuggestion = { loading: true };

  // Navigate to transaction result screen
  navTo('tx_result');

  // NEXA analyzes the transaction and shows suggestion on the same screen
  await nexaAnalyzeOnResult(txType, amount);
}

// Transaction definitions
const TX_DEFS = {
  transfer_relative: { label: 'Chuyển tiền', icon: '💸', cssClass: 'transfer' },
  hospital_fee: { label: 'Thanh toán viện phí', icon: '🏥', cssClass: 'hospital' },
  tuition_fee: { label: 'Thanh toán học phí', icon: '🎓', cssClass: 'tuition' },
  qr_payment: { label: 'Quét QR thanh toán', icon: '📱', cssClass: 'qr' },
  savings_deposit: { label: 'Gửi tiết kiệm', icon: '💰', cssClass: 'save' },
  view_insurance: { label: 'Xem trang bảo hiểm', icon: '🛡️', cssClass: 'insurance' },
};

// ─── NEXA Agent ──────────────────────────────────────────────────────
async function nexaAnalyze(txType, amount) {
  setAgentStatus('analyzing');
  logAgent(`Giao dịch mới: ${TX_DEFS[txType]?.label} — ${vnd(amount)}đ`);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: state.customer.id, txType, amount }),
    });
    const data = await res.json();
    state.lastAssessment = data;
    renderReasoning();

    const msg = data.message;
    logAgent(`Action: ${msg.action} | Need: ${data.assessment.need.score}(${data.assessment.need.level}) | Ready: ${data.assessment.readiness.score}(${data.assessment.readiness.level})`);

    // Don't suggest if already refused and no new strong signal
    if (state.customerRefused && txType !== 'hospital_fee' && data.assessment.readiness.level !== 'High') {
      // Just acknowledge quietly
      setAgentStatus('monitoring');
      return;
    }

    // Small delay for realism
    await delay(800);

    if (msg.action === 'offer_insurance') {
      state.currentProduct = msg.product;
      addChatMessage('bot', msg.text);
      addChatMessage('bot', '', { type: 'product', product: { ...msg.product, benefits: 'Chi trả viện phí, phẫu thuật, bệnh hiểm nghèo. Bảo vệ gia đình trước rủi ro y tế.' } });
      state.quickReplies = msg.quickReplies;
      state.nexaBadge++;
      state.hasSuggested = true;
      setAgentStatus('offered');
    } else if (msg.action === 'micro_saving') {
      state.currentProduct = { name: 'Micro-saving Round-up', premium: '50-100k/giao dịch' };
      addChatMessage('bot', msg.text);
      state.quickReplies = msg.quickReplies;
      state.nexaBadge++;
      setAgentStatus('offered');
    } else if (msg.action === 'educate') {
      if (msg.product) state.currentProduct = msg.product;
      addChatMessage('bot', msg.text);
      if (msg.product) {
        addChatMessage('bot', '', { type: 'product', product: { ...msg.product, benefits: 'Chi trả viện phí, phẫu thuật, bệnh hiểm nghèo.' } });
      }
      state.quickReplies = msg.quickReplies;
      state.nexaBadge++;
      setAgentStatus('nurturing');
    } else {
      // Suppress — don't message
      setAgentStatus('monitoring');
      return;
    }

    // Show notification on home
    if (state.screen !== 'nexa_chat') {
      showNexaNotification();
    }
    renderApp();
  } catch (e) {
    console.error('Analyze error:', e);
    setAgentStatus('monitoring');
  }
}

// NEXA analyzes transaction and shows suggestion on the tx_result screen
async function nexaAnalyzeOnResult(txType, amount) {
  setAgentStatus('analyzing');
  logAgent(`Giao dịch mới: ${TX_DEFS[txType]?.label} — ${vnd(amount)}đ`);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: state.customer.id, txType, amount }),
    });
    const data = await res.json();
    state.lastAssessment = data;
    renderReasoning();

    const msg = data.message;
    logAgent(`Action: ${msg.action} | Need: ${data.assessment.need.score}(${data.assessment.need.level}) | Ready: ${data.assessment.readiness.score}(${data.assessment.readiness.level})`);

    // Build reason text based on transaction signal
    const signalTexts = {
      transfer_relative: 'Bạn vừa chuyển tiền cho người thân — tôi thấy bạn đang hỗ trợ gia đình.',
      hospital_fee: 'Bạn vừa thanh toán viện phí — rủi ro y tế đang hiện hữu với bạn.',
      tuition_fee: 'Bạn vừa thanh toán học phí — bạn có người phụ thuộc cần bảo vệ.',
      qr_payment: 'Bạn vừa thanh toán qua QR — tôi phân tích hồ sơ tài chính của bạn.',
      savings_deposit: 'Bạn vừa gửi tiết kiệm — hành vi tài chính tích cực!',
      view_insurance: 'Bạn đang tìm hiểu bảo hiểm — tôi sẵn sàng tư vấn.',
    };
    const reasonText = signalTexts[txType] || 'Dựa trên giao dịch vừa rồi.';

    // Don't suggest if already refused and no new strong signal
    if (state.customerRefused && txType !== 'hospital_fee' && data.assessment.readiness.level !== 'High') {
      state._txSuggestion = {
        action: 'suppress',
        reasonText: 'Hồ sơ của bạn đang ổn định. Tôi sẽ theo dõi và đề xuất khi phù hợp hơn.',
      };
      setAgentStatus('monitoring');
      renderApp();
      return;
    }

    // Small delay for realism (loading animation)
    await delay(1200);

    if (msg.action === 'offer_insurance') {
      state.currentProduct = msg.product;
      state._txSuggestion = {
        action: 'offer_insurance',
        product: msg.product,
        reasonText: msg.text,
        needScore: data.assessment.need.score,
        needLevel: data.assessment.need.level,
        readyScore: data.assessment.readiness.score,
        readyLevel: data.assessment.readiness.level,
      };
      // Also add to chat
      addChatMessage('user', `${TX_DEFS[txType]?.icon} ${TX_DEFS[txType]?.label} — ${vnd(amount)}đ`);
      addChatMessage('bot', msg.text);
      addChatMessage('bot', '', { type: 'product', product: { ...msg.product, benefits: 'Chi trả viện phí, phẫu thuật, bệnh hiểm nghèo.' } });
      state.quickReplies = msg.quickReplies;
      state.nexaBadge++;
      state.hasSuggested = true;
      setAgentStatus('offered');
    } else if (msg.action === 'micro_saving') {
      state.currentProduct = { name: 'Micro-saving Round-up', premium: '50-100k/giao dịch' };
      state._txSuggestion = {
        action: 'micro_saving',
        reasonText: `${reasonText} Bạn có nhu cầu bảo vệ nhưng chưa sẵn sàng tài chính. Micro-saving là cách bắt đầu đơn giản — không cam kết lớn.`,
      };
      addChatMessage('user', `${TX_DEFS[txType]?.icon} ${TX_DEFS[txType]?.label} — ${vnd(amount)}đ`);
      addChatMessage('bot', msg.text);
      state.quickReplies = msg.quickReplies;
      state.nexaBadge++;
      setAgentStatus('offered');
    } else if (msg.action === 'educate') {
      if (msg.product) state.currentProduct = msg.product;
      state._txSuggestion = {
        action: 'educate',
        product: msg.product || null,
        reasonText: msg.text,
        needScore: data.assessment.need.score,
        needLevel: data.assessment.need.level,
        readyScore: data.assessment.readiness.score,
        readyLevel: data.assessment.readiness.level,
      };
      addChatMessage('user', `${TX_DEFS[txType]?.icon} ${TX_DEFS[txType]?.label} — ${vnd(amount)}đ`);
      addBotMsg(msg.text);
      if (msg.product) {
        addChatMessage('bot', '', { type: 'product', product: { ...msg.product, benefits: 'Chi trả viện phí, phẫu thuật, bệnh hiểm nghèo.' } });
      }
      state.quickReplies = msg.quickReplies;
      state.nexaBadge++;
      setAgentStatus('nurturing');
    } else {
      state._txSuggestion = {
        action: 'suppress',
        reasonText: msg.text || 'Hồ sơ của bạn đang ổn định. Tôi sẽ theo dõi và đề xuất khi phù hợp hơn.',
      };
      setAgentStatus('monitoring');
    }

    renderApp();
  } catch (e) {
    console.error('Analyze error:', e);
    state._txSuggestion = { action: 'suppress', reasonText: 'Tạm thời không có gợi ý.' };
    setAgentStatus('monitoring');
    renderApp();
  }
}

function showNexaNotification() {
  // Brief toast-like notification
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:35px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:8px 16px;border-radius:20px;font-size:11px;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:slideIn 0.3s ease;';
  el.innerHTML = '🤖 NEXA: Bạn có tin nhắn mới';
  $('phoneScreen').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── Chat helpers ────────────────────────────────────────────────────
function addChatMessage(sender, text, extra = {}) {
  state.chatMessages.push({ sender, text, ...extra });
  if (sender === 'bot' && state.screen !== 'nexa_chat') {
    state.nexaBadge++;
  }
}

function formatText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/«(.+?)»/g, '<a class="product-link" onclick="navigateToProduct(\'$1\')">$1</a>');
}

function navigateToProduct(fullName) {
  const parts = fullName.split(' — ');
  const pname = parts[0]?.trim();
  const tname = parts[1]?.trim();
  const p = products.find(x => x.product_name === pname && (!tname || x.tier_name === tname));
  if (p) {
    state._insProduct = p;
    state.insuranceViews++;
    navTo('insurance_detail');
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Quick reply handler ─────────────────────────────────────────────
async function handleQuickReply(replyId) {
  // If on tx_result screen, switch to chat so user sees the conversation
  if (state.screen === 'tx_result') {
    navTo('nexa_chat');
  }
  state.quickReplies = [];
  state._showRefusalReasons = false;
  renderApp();

  if (replyId === 'accept') {
    addUserMsg('✅ Đồng ý tìm hiểu');
    await proceedToEnroll();
    return;
  }
  if (replyId === 'accept_micro') {
    addUserMsg('👍 Đồng ý thử micro-saving');
    addBotMsg('Tuyệt! 🪙 Tôi đã bật micro-saving cho bạn. Mỗi giao dịch sẽ tự động làm tròn — tiền dư tích lũy tự động. Khi đủ khả năng, tôi sẽ gợi ý chuyển sang bảo hiểm đầy đủ.');
    state.quickReplies = [{ id: 'close', label: '👋 Cảm ơn', icon: '👋' }];
    setAgentStatus('micro-saving active');
    renderApp();
    return;
  }
  if (replyId === 'accept_educate') {
    addUserMsg('📖 Xem bài viết');
    addBotMsg('📖 **Bảo vệ gia đình trước rủi ro y tế — 5 điều cần biết**\n\n1. Bệnh hiểm nghèo có thể xảy ra bất ngờ\n2. Chi phí điều trị có thể hàng trăm triệu đồng\n3. Bảo hiểm y tế chi trả viện phí, phẫu thuật\n4. Tham gia sớm → phí thấp hơn\n5. Có 15 ngày xem lại và hủy nếu không hài lòng');
    state.quickReplies = [{ id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' }, { id: 'close', label: '👋 Để suy nghĩ', icon: '👋' }];
    renderApp();
    return;
  }
  if (replyId === 'refuse') {
    addUserMsg('❌ Không, cảm ơn');
    addBotMsg('Tôi tôn trọng quyết định của bạn. 💬 Bạn có thể chia sẻ lý do không tham gia lúc này không? Điều này giúp tôi phục vụ bạn tốt hơn.');
    showRefusalReasons();
    renderApp();
    return;
  }
  if (replyId === 'view_details') {
    addUserMsg('📋 Tìm hiểu sản phẩm');
    addBotMsg(`📋 **${state.currentProduct?.name || 'Bảo hiểm'}**\n\n• Quyền lợi: chi trả viện phí, phẫu thuật, bệnh hiểm nghèo\n• Thời gian chờ: 30 ngày (90 ngày cho bệnh có sẵn)\n• Gia hạn: 1 năm, tự động\n• Hủy trong 15 ngày nếu không hài lòng\n• Phí: ${state.currentProduct?.premium || '—'}\n\nBạn có thể xem thêm sản phẩm khác tại mục Bảo hiểm, hoặc nhắn tôi nếu cần tư vấn thêm.`);
    state.quickReplies = [{ id: 'close', label: '👋 Cảm ơn', icon: '👋' }];
    renderApp();
    return;
  }
  if (replyId === 'compare') {
    addUserMsg('📊 So sánh tất cả');
    try {
      const cmpRes = await fetch(`/api/compare-products/${state.customer.id}`).then(r => r.json());
      if (cmpRes.error) { addBotMsg('Xin lỗi, tôi không thể so sánh lúc này.'); renderApp(); return; }
      addChatMessage('bot', '', { type: 'compare', compare: cmpRes });
      const top = cmpRes.products[0];
      addBotMsg(`💡 Dựa trên thu nhập ${vnd(cmpRes.customer.income)}/tháng, tôi đề xuất **${top.product_name} — ${top.tier_name}** (phí ${vnd(top.premium)}/năm, chiếm ${top.pctOfIncome}% thu nhập năm). ${top.recommendation}`);
      state.quickReplies = [{ id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' }, { id: 'close', label: '👋 Cảm ơn', icon: '👋' }];
    } catch (e) { addBotMsg('Lỗi khi so sánh.'); }
    renderApp();
    return;
  }
  if (replyId === 'close') {
    addUserMsg('👋 Cảm ơn');
    addBotMsg('Cảm ơn bạn! Tôi sẽ tiếp tục đồng hành. Chúc bạn một ngày tốt lành! 🌟');
    setAgentStatus('monitoring');
    renderApp();
    return;
  }
}

function addUserMsg(text) { addChatMessage('user', text); }
function addBotMsg(text) { addChatMessage('bot', text); }

// ─── Refusal reasons ────────────────────────────────────────────────
function showRefusalReasons() {
  state._showRefusalReasons = true;
}

function refusalReasonList() {
  return [
    { id: 'not_now', icon: '⏳', label: 'Chưa cần lúc này' },
    { id: 'too_expensive', icon: '💸', label: 'Phí cao quá' },
    { id: 'no_trust', icon: '🤔', label: 'Không tin tưởng BH' },
    { id: 'has_other', icon: '✅', label: 'Đã có BH khác' },
    { id: 'need_more_info', icon: '📚', label: 'Cần tìm hiểu thêm' },
    { id: 'want_human', icon: '👤', label: 'Muốn gặp TVV' },
  ];
}

async function handleRefusal(reasonId) {
  const reasons = { not_now: '⏳ Chưa cần lúc này', too_expensive: '💸 Phí cao quá', no_trust: '🤔 Không tin tưởng bảo hiểm', has_other: '✅ Đã có bảo hiểm khác', need_more_info: '📚 Cần tìm hiểu thêm', want_human: '👤 Muốn gặp tư vấn viên' };
  addUserMsg(reasons[reasonId] || reasonId);
  state.customerRefused = true;
  state.refusalReason = reasonId;
  state._showRefusalReasons = false;
  setAgentStatus('re-planning');
  logAgent(`Khách từ chối: ${reasonId} → re-planning`);

  renderApp();

  await delay(600);

  try {
    const res = await fetch('/api/refuse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasonId, product: state.currentProduct }),
    });
    const data = await res.json();
    addBotMsg(data.text);
    logAgent(`Re-plan action: ${data.action} → ${data.nextStep}`);

    if (data.nextStep === 'offer_microsave') {
      state.quickReplies = data.quickReplies || [{ id: 'accept_micro', label: '🪙 Thử micro-saving', icon: '🪙' }, { id: 'close', label: '👋 Để sau', icon: '👋' }];
    } else if (data.nextStep === 'show_details' || data.nextStep === 'more_info') {
      state.quickReplies = data.quickReplies || [{ id: 'view_details', label: '📋 Xem chi tiết', icon: '📋' }, { id: 'close', label: '👋 Để sau', icon: '👋' }];
    } else if (data.nextStep === 'escalate') {
      addBotMsg('👤 Yêu cầu đã được ghi nhận. Chuyên viên tư vấn MSB sẽ liên hệ trong 24 giờ.');
      state.quickReplies = [];
      setAgentStatus('escalated');
    } else if (data.nextStep === 'terminate') {
      state.quickReplies = [];
      setAgentStatus('suppressed');
    } else {
      state.quickReplies = data.quickReplies || [];
      setAgentStatus('nurturing');
    }
    renderApp();
    renderReasoning();
  } catch (e) {
    console.error('Refuse error:', e);
  }
}

// ─── Enrollment ──────────────────────────────────────────────────────
async function proceedToEnroll() {
  await delay(500);
  try {
    const res = await fetch('/api/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: state.customer.id, product: state.currentProduct }),
    });
    const data = await res.json();
    addBotMsg(data.text);
    setAgentStatus('enrolling');
    logAgent('Khách đồng ý → Enrollment → GCNBH');
    renderApp();

    // Navigate to GCNBH
    await delay(1000);
    navTo('gcnbh');
  } catch (e) {
    console.error('Accept error:', e);
  }
}

function confirmEnrollment() {
  state.enrolledProduct = state.currentProduct;
  addBotMsg('🎉 Tham gia thành công! Giấy chứng nhận sẽ được gửi qua app trong 24 giờ. Cảm ơn bạn đã tin tưởng MSB!');
  setAgentStatus('goal achieved ✓');
  logAgent('Enrollment confirmed → TERMINATE (goal achieved)');
  navTo('success');
  renderReasoning();
}

// ─── Insurance browsing ──────────────────────────────────────────────
function viewInsuranceProduct(productId, tierName) {
  const p = products.find(x => x.product_id === productId && x.tier_name === tierName);
  if (p) {
    state._insProduct = p;
    state.insuranceViews++;
    state.screen = 'insurance_detail';
    state.navTab = 'insurance';
    renderApp();
    // NEXA notices customer browsing insurance
    if (!state.hasSuggested) {
      nexaNoticeInsuranceView();
    }
  }
}

async function nexaNoticeInsuranceView() {
  await delay(1000);
  addBotMsg(`🛡️ Tôi thấy bạn đang tìm hiểu ${state._insProduct?.product_name || 'bảo hiểm'}. Nếu bạn có thắc mắc, tôi sẵn sàng tư vấn ngay!`);
  state.nexaBadge++;
  setAgentStatus('observing interest');
  logAgent('Customer browsing insurance products → interest signal');
  renderApp();
  renderReasoning();
}

// ─── Agent reasoning panel ──────────────────────────────────────────
function setAgentStatus(status) {
  const el = $('agentStatus');
  if (el) {
    el.textContent = '● ' + status;
    el.style.color = status.includes('achieved') ? 'var(--accent)' : status.includes('monitor') ? 'var(--green)' : status.includes('analyz') ? 'var(--yellow)' : 'var(--green)';
  }
}

function logAgent(text) {
  state.agentLog.push({ time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), text });
}

function renderReasoning() {
  const el = $('rsBody');
  if (!el) return;

  if (state.tab === 'profile') {
    renderProfileTab(el);
    return;
  }

  const a = state.lastAssessment;
  let html = '';

  // Agent log timeline
  if (state.agentLog.length > 0) {
    html += `<div class="r-block"><div class="r-label">Agent timeline</div><div class="r-timeline">`;
    state.agentLog.slice(-8).forEach((l, i) => {
      html += `<div class="r-tl-item ${i < state.agentLog.length - 1 ? 'done' : ''}">[${l.time}] ${l.text}</div>`;
    });
    html += `</div></div>`;
  }

  if (!a) {
    html += `<div class="r-block"><div class="r-text" style="color:var(--text-faint);">Thực hiện giao dịch để NEXA phân tích...</div></div>`;
    el.innerHTML = html;
    return;
  }

  // Transaction
  html += `<div class="r-block"><div class="r-label">Giao dịch vừa rồi</div><div class="r-text">${a.transaction.icon} ${a.transaction.label}<br><span style="color:var(--text-faint);font-size:11px;">${a.transaction.signal}</span></div></div>`;

  // Need score
  html += scoreBlock('Tool ② Nhu cầu bảo vệ', a.assessment.need);
  // Readiness score
  html += scoreBlock('Tool ③ Sẵn sàng', a.assessment.readiness);

  // Action
  html += `<div class="r-block"><div class="r-label">Tool ④ → Action</div><div class="r-text"><span class="hl">${a.assessment.action}</span></div></div>`;

  // Product
  if (a.assessment.product?.product_name) {
    const pname = a.assessment.product.product_name + (a.assessment.product.tier_name ? ' — ' + a.assessment.product.tier_name : '');
    html += `<div class="r-block"><div class="r-label">Sản phẩm đề xuất</div><div class="r-text"><span class="gn">${pname}</span></div></div>`;
  }

  // Evidence
  html += `<div class="r-block"><div class="r-label">Bằng chứng (${a.assessment.evidence.count}/7)</div><div class="r-signals">${a.assessment.evidence.signals.map(s => `<div class="r-signal"><span class="dot"></span>${s}</div>`).join('')}</div></div>`;

  // Decision gate
  const cls = a.assessment.gate.auto ? 'auto' : 'human';
  html += `<div class="r-block"><div class="r-label">Decision Gate</div><div class="r-gate ${cls}">${a.assessment.gate.gate}</div></div>`;

  // Context
  html += `<div class="r-block"><div class="r-label">Context realtime</div><div class="r-grid">
    <div class="r-grid-item"><div class="k">Số dư</div><div class="v">${vnd(state.balance)}</div></div>
    <div class="r-grid-item"><div class="k">Giao dịch</div><div class="v">${state.transactions.length} lần</div></div>
    <div class="r-grid-item"><div class="*k">Xem trang BH</div><div class="v">${state.insuranceViews} lần</div></div>
    <div class="r-grid-item"><div class="k">Đã từ chối</div><div class="v">${state.customerRefused ? 'Có' : 'Không'}</div></div>
  </div></div>`;

  // Refusal info
  if (state.customerRefused) {
    html += `<div class="r-block"><div class="r-label">Trạng thái khách</div><div class="r-text"><span class="rd">Đã từ chối</span> — lý do: ${state.refusalReason || 'N/A'}<br>Agent đã đổi chiến thuật → không lặp lại đề xuất</div></div>`;
  }

  el.innerHTML = html;
}

function scoreBlock(label, score) {
  const cls = score.level.toLowerCase();
  return `<div class="r-block"><div class="r-label">${label}</div>
    <div class="score-row">
      <div class="score-bar"><div class="fill ${cls}" style="width:${score.score}%"></div></div>
      <div class="score-val">${score.score}</div>
      <div class="score-lvl ${cls}">${score.level}</div>
    </div></div>`;
}

function renderProfileTab(el) {
  const c = state.customer;
  if (!c) return;
  const f = c.full || {};
  el.innerHTML = `
    <div class="r-block"><div class="r-label">Khách hàng</div><div class="r-text"><span class="hl">${c.name}</span> · ${c.id}</div></div>
    <div class="r-grid">
      <div class="r-grid-item"><div class="k">Tuổi</div><div class="v">${c.age || '—'}</div></div>
      <div class="r-grid-item"><div class="k">Thu nhập</div><div class="v">${(c.income || 0).toFixed(1)}tr/tháng</div></div>
      <div class="r-grid-item"><div class="k">Need score</div><div class="v">${c.needScore || '—'} (${c.needLevel || '—'})</div></div>
      <div class="r-grid-item"><div class="k">Readiness</div><div class="v">${c.readinessScore || '—'} (${c.readinessLevel || '—'})</div></div>
      <div class="r-grid-item"><div class="k">Sức khỏe</div><div class="v">${f.health_status_1to5 || '—'}/5</div></div>
      <div class="r-grid-item"><div class="k">Stress</div><div class="v">${f.financial_stress_1to5 || '—'}/5</div></div>
      <div class="r-grid-item"><div class="k">Có BH tư nhân</div><div class="v">${f.has_private_insurance ? 'Có' : 'Không'}</div></div>
      <div class="r-grid-item"><div class="k">Sự kiện y tế</div><div class="v">${f.recent_medical_event ? 'Có' : 'Không'}</div></div>
    </div>
    <div class="r-block"><div class="r-label">Hành vi số</div>
      <div class="r-grid">
        <div class="r-grid-item"><div class="k">Đăng nhập/tháng</div><div class="v">${f.app_login_freq_month || '—'}</div></div>
        <div class="r-grid-item"><div class="k">Dịch vụ hay dùng</div><div class="v">${f.most_used_service || '—'}</div></div>
        <div class="r-grid-item"><div class="k">Xem trang BH</div><div class="v">${f.insurance_page_views_month || '—'}/tháng</div></div>
        <div class="r-grid-item"><div class="k">Tương tác số</div><div class="v">${f.digital_engagement_tier || '—'}</div></div>
      </div>
    </div>`;
}

// ─── Utils ───────────────────────────────────────────────────────────
function vnd(n) {
  if (!n) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';
}

// ─── Free chat: NEXA conversational engine ──────────────────────────
// User can type anything → NEXA detects intent → responds contextually

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = (input?.value || '').trim();
  if (!text) return;
  input.value = '';

  // Add user message
  addUserMsg(text);
  state.quickReplies = [];
  state._showRefusalReasons = false;
  renderApp();

  // NEXA typing indicator
  showChatTyping();
  await delay(600 + Math.random() * 600);

  // Detect intent and respond
  const response = detectIntentAndRespond(text);
  hideChatTyping();
  addBotMsg(response.text);
  if (response.product) {
    addChatMessage('bot', '', { type: 'product', product: response.product });
  }
  if (response.quickReplies) {
    state.quickReplies = response.quickReplies;
  }
  if (response.action === 'enroll') {
    await delay(500);
    await proceedToEnroll();
    return;
  }
  if (response.action === 'compare') {
    try {
      const cmpRes = await fetch(`/api/compare-products/${state.customer.id}`).then(r => r.json());
      if (cmpRes.error) { addBotMsg('Xin lỗi, tôi không thể so sánh lúc này.'); renderApp(); return; }
      addChatMessage('bot', '', { type: 'compare', compare: cmpRes });
      const top = cmpRes.products[0];
      addBotMsg(`💡 Dựa trên thu nhập ${vnd(cmpRes.customer.income)}/tháng, số dư ${vnd(cmpRes.customer.balance)}, và khả năng chi trả, tôi đề xuất **${top.product_name} — ${top.tier_name}** (phí ${vnd(top.premium)}/năm, chiếm ${top.pctOfIncome}% thu nhập năm). ${top.recommendation}`);
      state.quickReplies = [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'close', label: '👋 Cảm ơn', icon: '👋' },
      ];
    } catch (e) { addBotMsg('Lỗi khi so sánh sản phẩm. Vui lòng thử lại.'); }
    renderApp();
    return;
  }
  if (response.action === 'show_reasons') {
    showRefusalReasons();
  }
  renderApp();
}

function showChatTyping() {
  const cm = document.getElementById('chatMessages');
  if (!cm) return;
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  div.id = 'chatTyping';
  div.innerHTML = '<div class="cm-label">NEXA</div><div class="cm-text typing-dots"><span></span><span></span><span></span></div>';
  cm.appendChild(div);
  cm.scrollTop = cm.scrollHeight;
}

function hideChatTyping() {
  const el = document.getElementById('chatTyping');
  if (el) el.remove();
}

// ─── Intent detection ───────────────────────────────────────────────
function detectIntentAndRespond(text) {
  const t = text.toLowerCase().trim();
  const product = state.currentProduct;
  const pName = product?.name || 'bảo hiểm';
  const pPremium = product?.premium || '—';

  // ── Acceptance ──
  if (matchAny(t, ['đồng ý', 'dong y', 'ok', 'okay', 'tham gia', 'mua', 'yes', 'chấp nhận', 'quyết định', 'quyet dinh', 'đăng ký', 'dang ky', 'enroll', 'tôi muốn', 'toi muon', 'xác nhận', 'xac nhan'])) {
    return {
      text: `Tuyệt vời! 🎉 Tôi sẽ khởi tạo đăng ký **${pName}** cho bạn. Vui lòng kiểm tra Giấy chứng nhận dự kiến và xác nhận để hoàn tất.`,
      action: 'enroll',
    };
  }

  // ── Suitability: "tôi có phù hợp không?", "có nên mua không?", "có đáng không?" ──
  // Phải kiểm tra TRƯỚC refusal vì có chứa "không"
  if (matchAny(t, ['phù hợp', 'phu hop', 'hợp không', 'hop khong', 'hợp ko', 'nên không', 'nen khong', 'nên ko', 'nen ko', 'có nên', 'co nen', 'có đáng', 'co dang', 'đáng không', 'dang khong', 'nên mua', 'nen mua', 'nên tham gia', 'nen tham gia', 'có cần', 'co can', 'cần không', 'can khong', 'có nên không', 'co nen khong', 'đáng mua', 'dang mua', 'đáng tham gia', 'dang tham gia', 'giải pháp', 'giai phap', 'giúp', 'giup'])) {
    const a = state.lastAssessment;
    const c = state.customer;
    if (a) {
      const need = a.assessment.need;
      const ready = a.assessment.readiness;
      const ev = a.assessment.evidence;
      let verdict, tone;
      if (need.score >= 60 && ready.score >= 50) {
        verdict = `✅ **Có, bạn rất phù hợp.**`;
        tone = `Dựa trên hồ sơ của bạn:\n• Nhu cầu bảo vệ: **${need.score}/100** (${need.level}) — bạn có rủi ro y tế / người phụ thuộc cần bảo vệ\n• Sẵn sàng tài chính: **${ready.score}/100** (${ready.level}) — thu nhập đủ khả năng chi trả phí\n• Bằng chứng: ${ev.count}/7 tín hiệu cho thấy đây là thời điểm phù hợp\n\n**${pName}** (phí ${pPremium}) sẽ bảo vệ bạn trước viện phí, phẫu thuật, bệnh hiểm nghèo. Đây là quyết định tài chính khôn ngoan lúc này.`;
      } else if (need.score >= 60 && ready.score < 50) {
        verdict = `⚠️ **Bạn có nhu cầu cao nhưng chưa sẵn sàng tài chính.**`;
        tone = `• Nhu cầu bảo vệ: **${need.score}/100** (${need.level}) — bạn cần bảo vệ\n• Sẵn sàng tài chính: **${ready.score}/100** (${ready.level}) — phí có thể là gánh nặng\n\n💡 Tôi khuyên bạn bắt đầu với **Micro-saving** (50-100k/giao dịch) — tích lũy dần, không cam kết lớn. Sau 3-6 tháng, khi tài chính ổn hơn, chuyển sang bảo hiểm đầy đủ.`;
      } else {
        verdict = `🤔 **Nhu cầu bảo vệ của bạn chưa cấp bách lúc này.**`;
        tone = `• Nhu cầu bảo vệ: **${need.score}/100** (${need.level})\n• Sẵn sàng tài chính: **${ready.score}/100** (${ready.level})\n\nBạn chưa có rủi ro y tế rõ ràng. Tôi khuyên **chưa nên vội tham gia** — để tôi theo dõi thêm giao dịch và đề xuất khi phù hợp hơn. Trong lúc đó, bạn có thể tìm hiểu trước.`;
      }
      return {
        text: `${verdict}\n\n${tone}`,
        quickReplies: (need.score >= 60 && ready.score >= 50) ? [
          { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
          { id: 'close', label: '👋 Để sau', icon: '👋' },
        ] : (need.score >= 60 && ready.score < 50) ? [
          { id: 'accept_micro', label: '🪙 Micro-saving', icon: '🪙' },
          { id: 'close', label: '👋 Để sau', icon: '👋' },
        ] : [
          { id: 'view_details', label: '📋 Tìm hiểu trước', icon: '📋' },
          { id: 'close', label: '👋 Để sau', icon: '👋' },
        ],
      };
    }
    return {
      text: `🤔 Để tôi đánh giá độ phù hợp, hãy thực hiện một giao dịch (chuyển tiền, thanh toán viện phí...) — tôi sẽ phân tích hồ sơ và cho bạn biết **${pName}** có phù hợp không nhé.`,
    };
  }

  // ── Refusal ── (siết keyword: chỉ match câu từ chối rõ ràng, không match "có phù hợp không")
  if (matchAny(t, ['không cần', 'khong can', 'không muốn', 'khong muon', 'không tham gia', 'khong tham gia', 'không rồi', 'khong roi', 'từ chối', 'tu choi', 'bỏ', 'thôi', 'k cần', 'k muon', 'ko cần', 'ko muon', 'no thanks', 'không mua', 'khong mua', 'không làm', 'khong lam'])) {
    return {
      text: 'Tôi tôn trọng quyết định của bạn. 💬 Bạn có thể chia sẻ lý do không tham gia lúc này không? Điều này giúp tôi phục vụ bạn tốt hơn.',
      action: 'show_reasons',
    };
  }

  // ── Ask about price/premium ──
  if (matchAny(t, ['phí', 'phi', 'giá', 'gia bao', 'bao nhiêu', 'bao nhieu', 'bn tiền', 'bn tien', 'bao nhieu tien', 'mấy tiền', 'may tien', 'đắt', 'dat', 're', 'rẻ', 'giam', 'giảm', 'khuyến mãi', 'khuyen mai', 'discount', 'promo', 'chi phí', 'chi phi'])) {
    if (matchAny(t, ['đắt', 'dat', 're', 'rẻ', 'giam', 'giảm', 'khuyến mãi', 'khuyen mai', 'discount', 'promo'])) {
      return {
        text: `Tôi hiểu — phí ${pPremium} có thể là khoản chi lớn. Bạn có 3 lựa chọn:\n\n1. **Micro-saving**: 50-100k/giao dịch → tích lũy → BH sau 3-6 tháng\n2. **Gói thấp hơn**: tôi tìm sản phẩm phí rẻ hơn phù hợp bạn\n3. **Thanh toán theo tháng**: chia nhỏ phí ra hàng tháng\n\nBạn muốn xem lựa chọn nào?`,
        quickReplies: [
          { id: 'accept_micro', label: '🪙 Micro-saving', icon: '🪙' },
          { id: 'view_details', label: '📋 Xem gói rẻ hơn', icon: '📋' },
          { id: 'close', label: '👋 Để sau', icon: '👋' },
        ],
      };
    }
    return {
      text: `💰 Phí bảo hiểm **${pName}** là **${pPremium}**. \n\nVới thu nhập của bạn, phí này chiếm khoảng ${(parseFloat(String(pPremium).replace(/[^\d]/g, '')) / (state.customer?.income * 1000000 || 1) * 100).toFixed(1)}% thu nhập hàng tháng — mức chấp nhận được theo chuẩn tài chính cá nhân.\n\nBạn có thể thanh toán theo năm hoặc chia nhỏ hàng tháng. Bạn muốn tham gia không?`,
      quickReplies: [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'refuse', label: '❌ Để suy nghĩ', icon: '❌' },
      ],
    };
  }

  // ── Ask about benefits/coverage ──
  if (matchAny(t, ['quyền lợi', 'quyen loi', 'bảo vệ', 'bao ve', 'che đ', 'che do', 'cover', 'chi trả', 'chi tra', 'được gì', 'duoc gi', 'lợi ích', 'loi ich', 'benefit'])) {
    return {
      text: `📋 **Quyền lợi ${pName}:**\n\n✓ Chi trả viện phí nội/ngoại trú\n✓ Chi trả phẫu thuật\n✓ Bảo vệ bệnh hiểm nghèo\n✓ Thời gian chờ: 30 ngày (90 ngày cho bệnh có sẵn)\n✓ Có thể hủy trong 15 ngày nếu không hài lòng\n\nBạn muốn tìm hiểu thêm không?`,
      quickReplies: [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'close', label: '👋 Cảm ơn', icon: '👋' },
      ],
    };
  }

  // ── Ask about waiting period / terms ──
  if (matchAny(t, ['thời gian chờ', 'thoi gian cho', 'chờ', 'cho', 'điều khoản', 'dieu khoan', 'hợp đồng', 'hop dong', 'hủy', 'huy', 'thoái', 'thoai'])) {
    return {
      text: `📋 **Điều khoản ${pName}:**\n\n• Thời gian chờ: 30 ngày (90 ngày cho bệnh có sẵn)\n• Thời hạn hợp đồng: 1 năm, gia hạn tự động\n• Bạn có thể hủy trong 15 ngày đầu, hoàn phí\n• Sau 15 ngày: hủy theo quy định bảo hiểm\n\nBạn còn thắc mắc gì không?`,
    };
  }

  // ── Hesitation ──
  if (matchAny(t, ['suy nghĩ', 'suy nghi', 'để sau', 'de sau', 'chưa quyết', 'chua quyet', 'chưa muốn', 'chua muon', 'spouse', 'vợ', 'vo', 'chồng', 'chong', 'hỏi vợ', 'hoi vo', 'hỏi chồng', 'hoi chong', 'hỏi gia đình', 'hoi gia dinh', 'wait', 'later', 'chậm', 'cham', 'để nghĩ', 'de nghi', 'tính sau', 'tinh sau', 'xem sau', 'chưa ready', 'chua ready'])) {
    return {
      text: 'Tôi hiểu — quyết định tài chính cần thời gian cân nhắc. 👨‍👩‍👧 Không cần vội. Tôi sẽ ở đây khi bạn sẵn sàng. Trong lúc đó, bạn có muốn xem thêm thông tin về sản phẩm không?',
      quickReplies: [
        { id: 'view_details', label: '📋 Xem chi tiết', icon: '📋' },
        { id: 'close', label: '👋 Cảm ơn, để sau', icon: '👋' },
      ],
    };
  }

  // ── Ask "who are you" / "why me" ──
  if (matchAny(t, ['bạn là ai', 'ban la ai', 'm là ai', 'sao lại', 'sao lai', 'tại sao', 'tai sao', 'bằng cách', 'bang cach', 'làm sao', 'lam sao', 'biết tôi', 'biet toi', 'biết mình', 'biet minh', 'phân tích', 'phan tich', 'dữ liệu', 'du lieu', 'data', 'ai đề xuất', 'ai de xuat', 'sao biết', 'sao biet'])) {
    const a = state.lastAssessment;
    return {
      text: `🤖 Tôi là **NEXA**, trợ lý tài chính AI của MSB. Tôi phân tích giao dịch, số dư, và hành vi trên app để hiểu nhu cầu của bạn.\n\n${a ? `Dựa trên giao dịch gần đây:\n• Nhu cầu bảo vệ: **${a.assessment.need.score}/100** (${a.assessment.need.level})\n• Sẵn sàng tài chính: **${a.assessment.readiness.score}/100** (${a.assessment.readiness.level})\n• Bằng chứng: ${a.assessment.evidence.count}/7 tín hiệu\n\nĐó là lý do tôi đề xuất ${pName} cho bạn lúc này.` : 'Tôi đang theo dõi giao dịch của bạn để gợi ý đúng lúc.'}`,
    };
  }

  // ── Ask about a specific product by name ──
  const matchedProduct = products.find(p => {
    const full = `${p.product_name} ${p.tier_name}`.toLowerCase();
    return t.includes(p.product_name.toLowerCase()) || (t.includes(full) && full.length > 5);
  });
  if (matchedProduct && !matchAny(t, ['so sánh', 'so sanh', 'compare'])) {
    const minPrem = matchedProduct.min_premium_vnd || matchedProduct.annual_premium_min_vnd || 0;
    return {
      text: `📋 **${matchedProduct.product_name} — ${matchedProduct.tier_name}**\n\n• Nhà cung cấp: ${matchedProduct.provider}\n• Danh mục: ${matchedProduct.category}\n• Quyền lợi: ${(matchedProduct.key_benefits || 'Bảo vệ toàn diện').slice(0, 120)}\n• Phí từ: ${vnd(minPrem)}/năm\n• Độ tuổi: ${matchedProduct.min_age || 0} - ${matchedProduct.max_age || 99}\n\nBạn có muốn so sánh với các sản phẩm khác không?`,
      quickReplies: [
        { id: 'compare', label: '📊 So sánh tất cả', icon: '📊' },
        { id: 'close', label: '👋 Cảm ơn', icon: '👋' },
      ],
    };
  }

  // ── Greeting ──
  if (matchAny(t, ['hello', 'hi', 'chào', 'chao', 'hey', 'xin chào', 'xin chao'])) {
    return {
      text: `Chào bạn! 👋 Tôi là NEXA. ${product ? `Hiện tại tôi đang giới thiệu **${pName}** — bạn có thắc mắc gì không?` : 'Tôi có thể tư vấn bảo hiểm cho bạn. Hãy thực hiện giao dịch để tôi phân tích nhé!'}`,
    };
  }

  // ── Thanks ──
  if (matchAny(t, ['cảm ơn', 'cam on', 'thanks', 'thank', 'cám ơn', 'cam on'])) {
    return {
      text: 'Rất vui được hỗ trợ bạn! 🟹 Nếu cần thêm gì, cứ nhắn tôi nhé.',
    };
  }

  // ── Compare products ──
  if (matchAny(t, ['so sánh', 'so sanh', 'compare', 'đối chiếu', 'doi chieu', 'phù hợp nhất', 'phu hop nhat', 'gói nào tốt', 'goi nao tot', 'nên chọn', 'nen chon', 'gói nào nên', 'goi nao nen', 'tốt nhất', 'tot nhat', 'chọn gói', 'chon goi', 'giỏ sản phẩm', 'gio san pham', 'tất cả sản phẩm', 'tat ca san pham', 'xem tất cả', 'xem tat ca'])) {
    return {
      text: '📊 Đang so sánh tất cả sản phẩm bảo hiểm với khả năng tài chính của bạn...',
      action: 'compare',
    };
  }

  // ── Ask for cheaper alternative ──
  if (matchAny(t, ['re hơn', 're hon', 'gói khác', 'goi khac', 'thấp hơn', 'thap hon', 'khác', 'khac', 'thay thế', 'thay the', 'alternative'])) {
    return {
      text: `💡 Tôi tìm thêm lựa chọn cho bạn:\n\n1. **Bảo hiểm Trợ cấp nằm viện — Silver**: phí thấp hơn, chi trả viện phí cơ bản\n2. **Micro-saving**: 50-100k/giao dịch → tích lũy dần\n3. **Bảo hiểm Ung thư — Kcare**: chuyên biệt ung thư, phí rất thấp\n\nBạn muốn xem chi tiết gói nào?`,
      quickReplies: [
        { id: 'view_details', label: '📋 Xem chi tiết', icon: '📋' },
        { id: 'accept_micro', label: '🪙 Micro-saving', icon: '🪙' },
        { id: 'close', label: '👋 Để sau', icon: '👋' },
      ],
    };
  }

  // ── Ask about enrollment process ──
  if (matchAny(t, ['đăng ký', 'dang ky', 'thủ tục', 'thu tuc', 'mất bao lâu', 'mat bao lau', 'bao lâu', 'bao lau', 'process', 'how'])) {
    return {
      text: `📝 Quy trình tham gia rất đơn giản:\n\n1. Bạn đồng ý tham gia\n2. Hệ thống tạo **Giấy chứng nhận dự kiến** (GCNBH)\n3. Bạn xem GCNBH → xác nhận\n4. Hoàn tất! Hợp đồng chính thức gửi trong 24h\n\nToàn bộ quá trình diễn ra ngay trên app, không cần ra quầy. Bạn muốn bắt đầu không?`,
      quickReplies: [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'close', label: '👋 Để sau', icon: '👋' },
      ],
    };
  }

  // ── Ask about trust / credibility ──
  if (matchAny(t, ['tin', 'trust', 'uy tín', 'uy tin', 'đáng tin', 'dang tin', 'an toàn', 'an toan', 'scam', 'lừa', 'lua', 'giả', 'gia'])) {
    return {
      text: `🔒 Tôi hiểu lo ngại của bạn. **${pName}** được cung cấp bởi đối tác bảo hiểm uy tín, có giấy phép từ **Bộ Tài chính** Việt Nam. MSB là ngân hàng lớn, hoạt động dưới giám sát Ngân hàng Nhà nước.\n\n• Sản phẩm có giấy phép chính thức\n• Bạn có 15 ngày xem lại và hủy, hoàn phí\n• Toàn bộ giao dịch trên app MSB — bảo mật tuyệt đối\n\nBạn an tâm tham gia nhé!`,
      quickReplies: [
        { id: 'view_details', label: '📋 Tìm hiểu sản phẩm', icon: '📋' },
        { id: 'close', label: '👋 Cảm ơn', icon: '👋' },
      ],
    };
  }

  // ── Default: general response ──
  return {
    text: `Tôi hiểu bạn đang quan tâm. ${product ? `Hiện tại tôi đang giới thiệu **${pName}** (phí ${pPremium}). ` : ''}Bạn có thể hỏi tôi về:\n\n• Phí bao nhiêu?\n• Quyền lợi gì?\n• Điều khoản thế nào?\n• Có gói rẻ hơn không?\n• So sánh sản phẩm\n\nHoặc gõ **"so sánh sản phẩm"** để xem tất cả gói phù hợp với bạn.`,
  };
}

function matchAny(text, keywords) {
  return keywords.some(k => text.includes(k));
}

// ─── Expose to window ────────────────────────────────────────────────
window.navTo = navTo;
window.selectRecipient = selectRecipient;
window.doTransfer = doTransfer;
window.doQRPayment = doQRPayment;
window.doSavingsDeposit = doSavingsDeposit;
window.handleQuickReply = handleQuickReply;
window.handleRefusal = handleRefusal;
window.viewInsuranceProduct = viewInsuranceProduct;
window.confirmEnrollment = confirmEnrollment;
window.sendChatMessage = sendChatMessage;
window.selectPurpose = selectPurpose;
window.navigateToProduct = navigateToProduct;

// ─── Tab switching ──────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  if (e.target.classList?.contains('rs-tab')) {
    document.querySelectorAll('.rs-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    state.tab = e.target.dataset.tab;
    renderReasoning();
  }
});

// ─── Start ───────────────────────────────────────────────────────────
init();
