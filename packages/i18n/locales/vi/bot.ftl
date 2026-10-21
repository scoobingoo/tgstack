# Tin nhắn của bot. Gửi với parse_mode=HTML: luôn escape biến do người dùng nhập.

welcome =
    👋 Chào <b>{ $name }</b>!

    Bot này chạy trên <b>tgstack</b> — NestJS + grammY, Mini App, trang quản trị, gửi tin hàng loạt và thanh toán bằng Telegram Stars.

    Gửi /help để xem bot làm được gì.
welcome-open-app = 🚀 Mở ứng dụng

help =
    <b>Lệnh</b>
    /start — lời chào
    /help — trợ giúp
    /language — đổi ngôn ngữ
    /onboarding — thiết lập hồ sơ (ví dụ)
    /buy — xem cửa hàng (ví dụ)
    /cancel — huỷ thao tác hiện tại

language-choose = Chọn ngôn ngữ:
language-changed = ✅ Đã chuyển sang tiếng Việt.

cancel-done = Đã huỷ.
cancel-nothing = Không có gì để huỷ.

error-generic = 😕 Đã có lỗi xảy ra. Vui lòng thử lại sau.
error-forbidden = ⛔ Bạn không có quyền làm việc này.

command-start = Khởi động bot
command-help = Xem trợ giúp
command-language = Đổi ngôn ngữ
command-cancel = Huỷ thao tác hiện tại
command-onboarding = Thiết lập hồ sơ
command-buy = Xem cửa hàng
command-admin = Nhận liên kết đăng nhập quản trị

admin-link =
    🔐 Liên kết đăng nhập trang quản trị. Chỉ dùng được một lần và hết hạn sau { $minutes } phút:

    { $url }
admin-link-button = Mở trang quản trị

payment-thanks = 🎉 Cảm ơn bạn! Chúng mình đã nhận { $amount } ⭐ cho “{ $title }”.
payment-thanks-generic = 🎉 Cảm ơn bạn! Chúng mình đã nhận { $amount } ⭐.
payment-thanks-vnd = 🎉 Cảm ơn bạn! Chúng tôi đã nhận được khoản chuyển khoản { $amount } ₫ cho “{ $title }”.
payment-thanks-vnd-generic = 🎉 Cảm ơn bạn! Chúng tôi đã nhận được khoản chuyển khoản { $amount } ₫.
payment-error-invalid = Hoá đơn này không còn hợp lệ. Vui lòng thử lại từ đầu.
payment-error-unavailable = Rất tiếc, sản phẩm này không còn bán nữa.
payment-error-price-changed = Giá đã thay đổi. Vui lòng mở lại sản phẩm.
payment-error-generic = Không thể xử lý thanh toán. Vui lòng thử lại.

## VÍ DỤ: trình hướng dẫn làm quen (apps/server/src/examples/onboarding)

onboarding-ask-name = Mình nên gọi bạn là gì? Hãy gửi tên của bạn, hoặc /cancel.
onboarding-name-invalid = Vui lòng gửi tên dài từ 1 đến 64 ký tự.
onboarding-ask-interest = Rất vui được gặp <b>{ $name }</b>! Bạn quan tâm đến điều gì?
onboarding-interest-news = 📰 Tin tức
onboarding-interest-deals = 🏷 Ưu đãi
onboarding-interest-both = ✨ Cả hai
onboarding-confirm =
    Vui lòng xác nhận:
    Tên: <b>{ $name }</b>
    Quan tâm: <b>{ $interest }</b>
onboarding-confirm-yes = ✅ Lưu
onboarding-confirm-no = ↩️ Làm lại
onboarding-saved = 🎉 Xong rồi, { $name }! Hồ sơ của bạn đã được lưu.
onboarding-restart = Không sao, mình làm lại từ đầu nhé.
onboarding-use-buttons = Vui lòng dùng các nút ở trên, hoặc /cancel.

## VÍ DỤ: cửa hàng (apps/server/src/examples/shop)

shop-choose = 🛍 Bạn muốn mua gì?
shop-empty = Hiện chưa có sản phẩm nào.
