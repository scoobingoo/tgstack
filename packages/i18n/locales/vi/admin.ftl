# Trang quản trị (apps/admin).

app-name = tgstack admin

## Điều hướng
nav-dashboard = Tổng quan
nav-users = Người dùng
nav-broadcasts = Gửi tin hàng loạt
nav-products = Sản phẩm
nav-payments = Thanh toán
nav-section-main = Tổng quan
nav-section-shop = Cửa hàng (ví dụ)

## Chung
action-save = Lưu
action-cancel = Huỷ
action-close = Đóng
action-retry = Thử lại
action-logout = Đăng xuất
action-edit = Sửa
action-create = Tạo
action-confirm = Xác nhận
loading = Đang tải…
error-title = Đã có lỗi xảy ra
error-unauthorized = Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.
empty = Chưa có dữ liệu.
pagination-summary = { $from }–{ $to } trên { $total }
pagination-previous = Trước
pagination-next = Sau
theme-toggle = Đổi giao diện sáng/tối
language = Ngôn ngữ
all = Tất cả
saved = Đã lưu

## Đăng nhập
login-title = Đăng nhập { app-name }
login-description = Không cần mật khẩu. Mở bot trên Telegram và gửi lệnh bên dưới; bot sẽ trả về một liên kết đăng nhập dùng một lần (hiệu lực 5 phút).
login-command = Gửi lệnh này cho bot:
login-open-bot = Mở bot
login-admins-only = Chỉ quản trị viên mới đăng nhập được. Thêm Telegram ID của bạn vào ADMIN_TELEGRAM_IDS để trở thành quản trị viên.
callback-signing-in = Đang đăng nhập…
callback-failed = Liên kết đăng nhập không hợp lệ hoặc đã hết hạn. Gửi /admin cho bot để nhận liên kết mới.
callback-back = Quay lại trang đăng nhập

## Tổng quan
dashboard-title = Tổng quan
stat-total-users = Tổng người dùng
stat-new-today = Mới hôm nay
stat-new-7d = Mới (7 ngày)
stat-new-30d = Mới (30 ngày)
stat-active-7d = Hoạt động (7 ngày)
stat-blocked = Đã chặn bot
stat-revenue = Doanh thu
stat-revenue-value = { $amount } ⭐
stat-revenue-vnd = Chuyển khoản (VND)
chart-new-users = Người dùng mới, 30 ngày qua
chart-users = Người dùng
recent-payments = Thanh toán gần đây
view-all = Xem tất cả

## Người dùng
users-title = Người dùng
users-search-placeholder = Tìm theo tên, @username hoặc Telegram ID
users-filter-role = Vai trò
users-filter-blocked = Trạng thái
col-user = Người dùng
col-telegram-id = Telegram ID
col-locale = Ngôn ngữ
col-role = Vai trò
col-status = Trạng thái
col-joined = Tham gia
col-last-seen = Hoạt động gần nhất
status-active = Hoạt động
status-blocked = Đã chặn
role-USER = Người dùng
role-ADMIN = Quản trị
user-details = Chi tiết người dùng
user-payments = Thanh toán
user-spent = Đã chi
user-make-admin = Quyền quản trị
user-role-updated = Đã cập nhật vai trò
user-onboarding = Câu trả lời làm quen

## Gửi tin hàng loạt
broadcasts-title = Gửi tin hàng loạt
broadcasts-new = Tạo tin mới
broadcast-edit-title = Tin hàng loạt
col-message = Nội dung
col-progress = Tiến độ
col-created = Ngày tạo
col-author = Người tạo
broadcast-status-DRAFT = Bản nháp
broadcast-status-SCHEDULED = Đã hẹn giờ
broadcast-status-QUEUED = Đang chờ
broadcast-status-RUNNING = Đang gửi
broadcast-status-COMPLETED = Hoàn tất
broadcast-status-CANCELLED = Đã huỷ
broadcast-status-FAILED = Thất bại
composer-text = Nội dung
composer-text-help = HTML của Telegram: <b>đậm</b>, <i>nghiêng</i>, <u>gạch chân</u>, <s>gạch ngang</s>, <a href="…">liên kết</a>, <code>mã</code>, <tg-spoiler>ẩn</tg-spoiler>.
composer-characters = { $count } / { $limit } ký tự
composer-image = URL hình ảnh (không bắt buộc)
composer-button-text = Chữ trên nút (không bắt buộc)
composer-button-url = URL của nút
composer-preview = Xem trước
composer-save = Lưu bản nháp
composer-send-preview = Gửi thử cho tôi
composer-preview-sent = Đã gửi bản thử tới Telegram của bạn
composer-start = Bắt đầu gửi
composer-start-confirm-title = Gửi ngay?
composer-start-confirm = Tin sẽ được gửi tới mọi người nhận chưa chặn bot, theo tốc độ đã cấu hình. Không thể hoàn tác, nhưng có thể huỷ trong khi đang gửi.
composer-cancel-broadcast = Huỷ gửi
composer-cancel-confirm-title = Huỷ đợt gửi này?
composer-cancel-confirm = Những người chưa nhận được tin sẽ không nhận được nữa.
composer-read-only = Đợt gửi đã bắt đầu; không thể sửa nội dung nữa.
progress-label = Đã xử lý { $done } / { $total }
progress-sent = Đã gửi
progress-failed = Thất bại
progress-live = Trực tiếp

## Sản phẩm (ví dụ)
products-title = Sản phẩm
products-new = Sản phẩm mới
product-edit = Sửa sản phẩm
col-title = Tên
col-price = Giá
col-active = Đang bán
field-title = Tên sản phẩm
field-description = Mô tả
field-price = Giá (Stars)
field-price-vnd = Giá bằng đồng khi chuyển khoản (tuỳ chọn)
field-price-vnd-placeholder = Ví dụ 50000 (cần PayOS)
field-image = URL hình ảnh (không bắt buộc)
field-active = Đang bán
product-deactivate = Ngừng bán
product-deactivate-confirm = Khách hàng sẽ không thấy sản phẩm này nữa. Các thanh toán cũ vẫn được giữ.
product-saved = Đã lưu sản phẩm

## Thanh toán
payments-title = Thanh toán
col-amount = Số tiền
col-product = Sản phẩm
col-date = Ngày
col-charge = Mã giao dịch
payment-status-PAID = Đã thanh toán
payment-status-REFUNDED = Đã hoàn tiền
payment-refund = Hoàn tiền
payment-refund-title = Hoàn { $amount } cho { $name }?
payment-refund-confirm = Stars sẽ được trả lại vào số dư của người dùng qua Telegram. Không thể hoàn tác.
payment-refund-manual = Đánh dấu đã hoàn tiền
payment-refund-confirm-manual = PayOS không thể hoàn tiền tự động. Hãy chuyển khoản trả lại cho người mua từ tài khoản ngân hàng của bạn trước, rồi đánh dấu đã hoàn tiền tại đây.
payment-refunded = Đã hoàn tiền

## Audience (segments)
audience-title = Người nhận
audience-languages = Ngôn ngữ
audience-languages-help = Không chọn: mọi ngôn ngữ.
audience-activity = Hoạt động
audience-activity-any = Tất cả
audience-activity-active = Hoạt động trong (ngày)
audience-activity-inactive = Không hoạt động (ngày)
audience-days = Số ngày
audience-purchases = Mua hàng
audience-purchases-any = Tất cả
audience-purchases-buyers = Đã thanh toán ít nhất một lần
audience-purchases-non-buyers = Chưa từng thanh toán
audience-estimate = Hiện có { $formatted } người nhận
audience-estimate-invalid = Hoàn tất điều kiện để xem số người nhận.
audience-help = Các điều kiện kết hợp với nhau. Người đã chặn bot không bao giờ nhận tin. Danh sách người nhận được tính lại khi bắt đầu gửi.
audience-everyone = Mọi người dùng chưa chặn bot
audience-summary-locales = Ngôn ngữ: { $locales }
audience-summary-active = Hoạt động trong { $days } ngày gần nhất
audience-summary-inactive = Không hoạt động ít nhất { $days } ngày

## Scheduling
schedule-button = Hẹn giờ
schedule-title = Hẹn giờ gửi
schedule-description = Đợt gửi tự bắt đầu vào thời điểm này (múi giờ của bạn: { $zone }). Trước đó bạn vẫn có thể gửi ngay, đổi giờ hoặc chuyển về bản nháp.
schedule-at = Ngày và giờ
schedule-save = Hẹn giờ
schedule-reschedule = Đổi giờ
schedule-unschedule = Về bản nháp
schedule-send-now = Gửi ngay
scheduled-for = Đã hẹn lúc { $date }
scheduled-help = Worker sẽ bắt đầu gửi trong khoảng 15 giây sau thời điểm đó.
composer-read-only-scheduled = Không thể sửa đợt gửi đã hẹn giờ. Chuyển về bản nháp để sửa.
