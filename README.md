# NEXA × MSB — AI Agent Demo

**Trải nghiệm app MSB thật → Giao dịch → NEXA gợi ý BH → Chatbot tư vấn**

NEXA là AI Agent tối đa hóa cơ hội chuyển đổi sản phẩm bảo hiểm qua can thiệp ngữ cảnh chính xác. Agent quan sát giao dịch khách hàng, tính toán Need + Readiness score, và gợi ý bảo hiểm đúng lúc qua tin nhắn trong app.

---

## Quick Start

### Chạy local

```bash
cd nexa
npm install
npm start
```

Mở **http://localhost:8080**

### Deploy lên GreenNode AgentBase

```bash
cd nexa
docker build --platform linux/amd64 -t <registry>/<repo>/nexa:<tag> .
docker push <registry>/<repo>/nexa:<tag>
# Update runtime via AgentBase API
```

**Endpoint production**: https://endpoint-a9323e02-88e8-4eac-b841-0f19c16a9e5d.agentbase-runtime.aiplatform.vngcloud.vn

---

## Hướng dẫn sử dụng demo

### 1. Chọn khách hàng

Mở dashboard → dropdown góc phải → chọn 1 trong 20 khách hàng demo. Mỗi khách hàng có hồ sơ khác nhau (thu nhập, sức khỏe, rủi ro, readiness).

### 2. Thao tác trên app MSB (phone frame bên trái)

| Màn hình | Cách thao tác | NEXA phản hồi |
|----------|--------------|---------------|
| **Trang chủ** | Xem số dư, quick actions, giao dịch gần đây | — |
| **Chuyển tiền** | Chọn người nhận → chọn mục đích → nhập số tiền → xác nhận | Gợi ý BH nếu có nhu cầu bảo vệ |
| **Quét QR** | Chọn mục đích → nhập số tiền → xác nhận | Chỉ gợi ý khi mục đích là viện phí/học phí |
| **Tiết kiệm** | Nhập số tiền → chọn kỳ hạn → gửi | NEXA ghi nhận hành vi tích cực |
| **Bảo hiểm** | Duyệt 4 gói Kcare (Đồng/Bạc/Vàng/Kim Cương) + sản phẩm khác | NEXA ghi nhận interest signal |
| **Chat NEXA** | Nhấn icon NEXA góc phải → chat tự do | Trả lời theo intent, so sánh sản phẩm |

### 3. Giao dịch trigger gợi ý bảo hiểm

Chỉ một số loại giao dịch mới trigger NEXA gợi ý:

| Giao dịch | Trigger? | Lý do |
|-----------|----------|-------|
| Thanh toán viện phí | ✅ | Rủi ro y tế hiện hữu |
| Thanh toán học phí | ✅ | Có người phụ thuộc |
| Chuyển tiền người thân | ✅ | Hỗ trợ gia đình |
| Quét QR mua sắm/ăn uống | ❌ | Giao dịch hàng ngày |
| Gửi tiết kiệm | ❌ | Hành vi tích cực, không cần BH ngay |

### 4. Khi NEXA gợi ý bảo hiểm

Sau giao dịch trigger, NEXA hiện gợi ý với:
- **Message personalize**: "NEXA nhận thấy một khoảng trống bảo vệ. Khách hàng vừa phát sinh chi phí y tế..."
- **Product link** clickable («tên sản phẩm») → click để xem chi tiết
- **Phí thực tế** từ sheet 08 (premium table) theo tuổi/giới tính
- **Need score** + **Readiness score** (cap 100)
- Nút **"Tìm hiểu sản phẩm"** → chỉ hiện thông tin, KHÔNG enroll luôn
- Nút **"Không, cảm ơn"** → hỏi lý do từ chối → re-plan

### 5. Chat với NEXA

Nhấn icon NEXA (góc dưới phải) để mở chat. Gõ tự do hoặc dùng quick replies.

| Lệnh/Câu hỏi | NEXA phản hồi |
|--------------|---------------|
| **"so sánh sản phẩm"** / **"compare"** / **"gói nào tốt"** | Bảng so sánh tất cả sản phẩm BH với affordability score |
| **"tôi phù hợp với sản phẩm nào?"** | Đánh giá suitability dựa trên Need/Readiness/Evidence |
| **"phí bao nhiêu?"** | Phí sản phẩm hiện tại + % thu nhập |
| **"quyền lợi gì?"** | Quyền lợi chi tiết |
| **"có gói rẻ hơn không?"** | Đề xuất alternatives (micro-saving, gói thấp hơn) |
| **"bảo hiểm ung thư"** (tên sản phẩm) | Thông tin chi tiết sản phẩm đó |
| **"không muốn"** / **"từ chối"** | Hỏi lý do → re-plan theo 6 lý do từ chối |
| **"đồng ý"** / **"tham gia"** | Khởi tạo enrollment → GCNBH |

### 6. So sánh sản phẩm

Gõ **"so sánh sản phẩm"** trong chat → NEXA hiện bảng so sánh:

- **Tất cả sản phẩm BH sức khỏe** (17 gói từ RP01-RP04)
- **Phí/năm** từ premium table (sheet 08)
- **% thu nhập** — phí chiếm bao nhiêu % thu nhập năm
- **Đệm thanh** — số tháng có thể trả phí từ tiền dư (số dư - nợ)
- **Đánh giá**: Rất phù hợp / Phù hợp / Khó khăn / Không phù hợp
- Xếp theo % thu nhập tăng dần

### 7. 6 lý do từ chối → 6 phản ứng khác nhau

| Lý do | NEXA phản ứng |
|-------|---------------|
| Chưa cần lúc này | Educate & Nurture + hẹn reassess |
| Phí cao quá | Đề xuất Micro-saving pathway |
| Không tin tưởng BH | Gửi thông tin chi tiết, build trust |
| Đã có BH khác | Suppress, ghi nhận |
| Cần tìm hiểu thêm | Gửi chi tiết quyền lợi, điều khoản |
| Muốn gặp TVV | Escalate to human (RM 24h) |

---

## Sản phẩm bảo hiểm

### Product mapping theo sheet 3

Sản phẩm đề xuất cho từng khách hàng được lấy từ cột **"Sản phẩm đề xuất"** trong sheet `03_CustomerProfiles`:

| Khách hàng | Sản phẩm đề xuất | Action |
|------------|-----------------|--------|
| VN00012 | Bảo Việt An Gia — Kim Cương | Offer Insurance |
| VN02939 | Bảo Việt An Gia — Vàng | Offer Insurance |
| VN00035 | Bệnh hiểm nghèo — Platinum | Offer Insurance |
| VN00105 | Trợ cấp nằm viện — VIP | Offer Insurance |
| VN00005 | Bệnh hiểm nghèo — Gold | Educate & Nurture |
| VN00001 | Bệnh hiểm nghèo — Silver | Micro-saving pathway |
| ... | ... | ... |

### Phí Kcare (sheet 08)

| Gói | Phí tối thiểu/năm |
|-----|-------------------|
| Đồng | 306,960đ |
| Bạc | 613,920đ |
| Vàng | 1,227,840đ |
| Kim Cương | 2,455,680đ |

---

## API

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/health` | GET | Health check (platform requirement) |
| `/api/demo-customers` | GET | 20 demo customers |
| `/api/customer/:id` | GET | Chi tiết 1 khách hàng |
| `/api/products` | GET | Catalogue sản phẩm BH (with min_premium_vnd) |
| `/api/analyze` | POST | Phân tích giao dịch → gợi ý BH |
| `/api/compare-products/:customerId` | GET | So sánh tất cả sản phẩm theo affordability |
| `/api/refuse` | POST | Xử lý từ chối → re-plan |
| `/api/accept` | POST | Xử lý đồng ý → GCNBH |
| `/api/transactions` | GET | Loại giao dịch |
| `/api/refusal-reasons` | GET | 6 lý do từ chối |

---

## Kiến trúc

```
nexa/
├── server.js              # Express API server (port 8080)
├── data-loader.js         # Load Excel dataset (sheets 03, 04, 06, 07, 08)
├── Dockerfile             # Docker image for AgentBase
├── agent/
│   ├── tools.js           # 3 Tools: Need score, Readiness score, Product KB
│   ├── interactive.js     # Transaction analysis + chat flow + compare
│   ├── engine.js          # Full loop (scenario mode)
│   └── scenarios.js       # Pre-scripted scenarios
├── public/
│   ├── index.html         # App layout
│   ├── css/style.css      # MSB orange theme
│   ├── js/app.js          # Full interactive app + NEXA chatbot
│   └── assets/
│       ├── icon.png       # NEXA bot icon
│       └── qr-code.png    # QR code for payment screen
└── data/
    └── dataset.xlsx       # ReadyShield demo dataset (gitignored)
```

### Data sources (Excel sheets)

| Sheet | Nội dung |
|-------|----------|
| `03_CustomerProfiles` | 20 demo customers + product mapping |
| `04_FullDataset` | 5000 customers với tất cả columns |
| `06_AgentLoopData` | Real-time signals, interaction history, loop state |
| `07_RealProductCatalogue` | 21 sản phẩm BH (RP01-RP08) |
| `08_RealProductPremiumTable` | Premium table theo tuổi/giới tính |

---

## Scoring Engine

### Need Score (Tool 2) — WHY

| Factor | Weight |
|--------|--------|
| Health vulnerability | 30% |
| Recent medical event | 30% |
| No private insurance | 25% |
| Dependents | 10% |
| Healthcare spending | 5% |

High: ≥70 | Medium: 45-69 | Low: <45 | **Cap: 100**

### Readiness Score (Tool 3) — WHEN

| Factor | Weight |
|--------|--------|
| Affordability | 40% |
| Financial stability | 30% |
| Access readiness | 20% |
| Engagement | 10% |

High: ≥70 | Medium: 50-69 | Low: <50 | **Cap: 100**

### Decision Matrix (Tool 4) — WHAT

| Need \ Readiness | High | Medium | Low |
|------------------|------|--------|-----|
| **High** | Offer Insurance | Educate & Nurture | Micro-saving |
| **Medium** | Offer Insurance | Educate & Nurture | Suppress |
| **Low** | Suppress | Suppress | Suppress |

---

## GreenNode AgentBase Deployment

| Thông tin | Giá trị |
|-----------|---------|
| Runtime name | `nexa-msb-agent` |
| Runtime ID | `runtime-c572a982-bc5c-4d1f-a692-e36b5cc9fbbd` |
| Flavor | `runtime-s2-general-2x4` (2 CPU, 4GB RAM) |
| Image | `vcr.vngcloud.vn/111480-abp114597/nexa:<tag>` |
| Endpoint | https://endpoint-a9323e02-88e8-4eac-b841-0f19c16a9e5d.agentbase-runtime.aiplatform.vngcloud.vn |
| Console | https://aiplatform.console.vngcloud.vn/agent-runtime?tab=runtime |

---

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JS + CSS (phone frame simulation)
- **Data**: Excel (xlsx library)
- **Deploy**: Docker → GreenNode AgentBase Container Registry → Runtime
- **UI**: MSB orange theme (#e85d04, #f58220)
