# NEXA × MSB — App Mô Phỏng Tương Tác

**Trải nghiệm app MSB thật → Giao dịch → NEXA gợi ý BH → Chatbot tư vấn**

## Cách hoạt động

Người dùng thao tác trên **app MSB mô phỏng** (trong phone frame) như app thật:
- Xem số dư, giao dịch gần đây
- Chuyển tiền (chọn người nhận → nhập số tiền → xác nhận)
- Quét QR thanh toán
- Gửi tiết kiệm
- Duyệt sản phẩm bảo hiểm
- Chat với NEXA

**NEXA quan sát** mọi giao dịch, tính toán Need + Readiness score, và gợi ý BH đúng lúc qua **tin nhắn trong app**.

## Luồng demo (theo 19 cảnh của NEXA_Demo_Tuong_tac.html)

```
#1  Mở app → xem trang chủ, số dư
#2  Thực hiện giao dịch (QR/chuyển tiền/viện phí/học phí)
#3  NEXA phân tích → gửi tin nhắn gợi ý BH (kèm product card)
#4  Khách "Để sau" hoặc "Không, cảm ơn"
#5  Khách đóng cửa sổ (chưa nói lý do)
#6  NEXA hỏi thăm nhẹ nhàng: "Bạn có thể chia sẻ lý do...?"
#7  Khách chọn lý do từ chối
#8  NEXA dừng lời mời, đổi hành động (re-plan)
#9  NEXA gửi nội dung giáo dục theo vướng mắc
#10 Tín hiệu mới tích lũy (nurture)
#11 NEXA biết chờ — không spam
#12 Khách tự duyệt trang BH (interest signal)
#13 NEXA ghi nhận thêm bằng chứng
#14 Khách giao dịch mới (trạng thái đã khác)
#15 NEXA re-assess → quyết định mới
#16 Khách sẵn sàng → đồng ý
#17 GCNBH hiện → khách scroll → xác nhận
#18 Tham gia thành công
#19 NEXA đồng hành lâu dài
```

## Chạy

```bash
cd nexa
npm install
npm start
```

Mở **http://localhost:3000**

## Giao diện

| Khu vực | Mô tả |
|---------|-------|
| **Phone (trái)** | App MSB mô phỏng — đa màn hình, navigation, giao dịch thật |
| **Reasoning (phải)** | Agent internals: scores, evidence, decision gate, timeline |

## App screens

| Screen | Tính năng |
|--------|-----------|
| **Home** | Số dư, quick actions, giao dịch gần đây, notification NEXA |
| **Transfer** | Chọn người nhận (người thân, viện phí, học phí) → nhập tiền → xác nhận |
| **QR Pay** | Quét QR → nhập tiền → thanh toán |
| **Savings** | Gửi tiết kiệm với kỳ hạn |
| **Insurance** | Duyệt sản phẩm BH → xem chi tiết |
| **NEXA Chat** | Hội thoại với NEXA — gợi ý, quick replies, refusal reasons |
| **GCNBH** | Giấy chứng nhận dự kiến → xác nhận tham gia |
| **Success** | Hoàn tất enrollment |

## 6 lý do từ chối → 6 phản ứng khác nhau

| Lý do | NEXA phản ứng |
|-------|---------------|
| ⏳ Chưa cần | Educate & Nurture + hẹn reassess |
| 💸 Phí cao | Đề xuất Micro-saving pathway |
| 🤔 Không tin tưởng | Gửi thông tin chi tiết, build trust |
| ✅ Đã có BH | Suppress, ghi nhận |
| 📚 Cần thêm info | Gửi chi tiết quyền lợi, điều khoản |
| 👁 Muốn gặp TVV | Escalate to human (RM 24h) |

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/demo-customers` | GET | 20 demo customers |
| `/api/analyze` | POST | Analyze transaction → suggestion |
| `/api/refuse` | POST | Handle refusal → re-plan |
| `/api/accept` | POST | Handle acceptance → GCNBH |
| `/api/products` | GET | Product catalogue |

## Kiến trúc

```
nexa/
├── server.js              # Express API
├── data-loader.js         # Load Excel dataset
├── agent/
│   ├── tools.js           # 3 Tools (Need, Readiness, Product KB)
│   ├── interactive.js     # Transaction analysis + chat flow
│   ├── engine.js          # Full loop (scenario mode)
│   └── scenarios.js       # Pre-scripted scenarios
├── public/
│   ├── index.html         # App layout
│   ├── css/style.css      # MSB app styling
│   ├── js/app.js          # Full interactive app + NEXA chatbot
│   └── assets/icon.png
└── package.json
```
