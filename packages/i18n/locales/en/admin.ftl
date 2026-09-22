# Admin dashboard (apps/admin).

app-name = tgstack admin

## Navigation
nav-dashboard = Dashboard
nav-users = Users
nav-broadcasts = Broadcasts
nav-products = Products
nav-payments = Payments
nav-section-main = Overview
nav-section-shop = Shop (example)

## Common
action-save = Save
action-cancel = Cancel
action-close = Close
action-retry = Retry
action-logout = Log out
action-edit = Edit
action-create = Create
action-confirm = Confirm
loading = Loading…
error-title = Something went wrong
error-unauthorized = Your session expired. Please sign in again.
empty = Nothing here yet.
pagination-summary = { $from }–{ $to } of { $total }
pagination-previous = Previous
pagination-next = Next
theme-toggle = Toggle theme
language = Language
all = All
saved = Saved

## Login
login-title = Sign in to { app-name }
login-description = There are no passwords here. Open your bot in Telegram and send the command below; it replies with a one-time login link (valid for 5 minutes).
login-command = Send this command to the bot:
login-open-bot = Open the bot
login-admins-only = Only admins can sign in. Add your Telegram ID to ADMIN_TELEGRAM_IDS to become one.
callback-signing-in = Signing you in…
callback-failed = This login link is invalid or has expired. Send /admin to the bot to get a new one.
callback-back = Back to sign-in

## Dashboard
dashboard-title = Dashboard
stat-total-users = Total users
stat-new-today = New today
stat-new-7d = New (7 days)
stat-new-30d = New (30 days)
stat-active-7d = Active (7 days)
stat-blocked = Blocked the bot
stat-revenue = Revenue
stat-revenue-value = { $amount } ⭐
chart-new-users = New users, last 30 days
chart-users = Users
recent-payments = Recent payments
view-all = View all

## Users
users-title = Users
users-search-placeholder = Search by name, @username or Telegram ID
users-filter-role = Role
users-filter-blocked = Status
col-user = User
col-telegram-id = Telegram ID
col-locale = Language
col-role = Role
col-status = Status
col-joined = Joined
col-last-seen = Last seen
status-active = Active
status-blocked = Blocked
role-USER = User
role-ADMIN = Admin
user-details = User details
user-payments = Payments
user-spent = Spent
user-make-admin = Admin access
user-role-updated = Role updated
user-onboarding = Onboarding answers

## Broadcasts
broadcasts-title = Broadcasts
broadcasts-new = New broadcast
broadcast-edit-title = Broadcast
col-message = Message
col-progress = Progress
col-created = Created
col-author = Author
broadcast-status-DRAFT = Draft
broadcast-status-QUEUED = Queued
broadcast-status-RUNNING = Sending
broadcast-status-COMPLETED = Completed
broadcast-status-CANCELLED = Cancelled
broadcast-status-FAILED = Failed
composer-text = Message
composer-text-help = Telegram HTML: <b>bold</b>, <i>italic</i>, <u>underline</u>, <s>strike</s>, <a href="…">link</a>, <code>code</code>, <tg-spoiler>spoiler</tg-spoiler>.
composer-characters = { $count } / { $limit } characters
composer-image = Image URL (optional)
composer-button-text = Button text (optional)
composer-button-url = Button URL
composer-preview = Preview
composer-save = Save draft
composer-send-preview = Send preview to me
composer-preview-sent = Preview sent to your Telegram
composer-start = Start broadcast
composer-start-confirm-title = Send to every user?
composer-start-confirm = The message goes to all users who have not blocked the bot, at the configured rate. This cannot be undone, but you can cancel while it is sending.
composer-cancel-broadcast = Cancel broadcast
composer-cancel-confirm-title = Cancel this broadcast?
composer-cancel-confirm = Users who have not received it yet will not get it.
composer-read-only = This broadcast has been started; its content can no longer be edited.
progress-label = { $done } of { $total } handled
progress-sent = Sent
progress-failed = Failed
progress-live = Live

## Products (example)
products-title = Products
products-new = New product
product-edit = Edit product
col-title = Title
col-price = Price
col-active = Active
field-title = Title
field-description = Description
field-price = Price in Stars
field-image = Image URL (optional)
field-active = Available for sale
product-deactivate = Deactivate
product-deactivate-confirm = Customers will no longer see this product. Past payments are kept.
product-saved = Product saved

## Payments
payments-title = Payments
col-amount = Amount
col-product = Product
col-date = Date
col-charge = Charge ID
payment-status-PAID = Paid
payment-status-REFUNDED = Refunded
payment-refund = Refund
payment-refund-title = Refund { $amount } ⭐ to { $name }?
payment-refund-confirm = The Stars go back to the user's balance through Telegram. This cannot be undone.
payment-refunded = Payment refunded
