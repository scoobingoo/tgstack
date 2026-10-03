# Bot messages. Sent with parse_mode=HTML: escape every user-provided variable.

welcome =
    👋 Hi, <b>{ $name }</b>!

    This bot runs on <b>tgstack</b> — NestJS + grammY, a Mini App, an admin dashboard, broadcasts and Telegram Stars payments.

    Send /help to see what I can do.
welcome-open-app = 🚀 Open the app

help =
    <b>Commands</b>
    /start — welcome message
    /help — this help
    /language — change the language
    /onboarding — set up your profile (example)
    /buy — browse the shop (example)
    /cancel — stop the current action

language-choose = Choose your language:
language-changed = ✅ Language set to English.

cancel-done = Cancelled.
cancel-nothing = There is nothing to cancel.

error-generic = 😕 Something went wrong. Please try again later.
error-forbidden = ⛔ You are not allowed to do that.

command-start = Start the bot
command-help = Show help
command-language = Change the language
command-cancel = Cancel the current action
command-onboarding = Set up your profile
command-buy = Browse the shop
command-admin = Get an admin login link

admin-link =
    🔐 Your admin dashboard login link. It works once and expires in { $minutes } minutes:

    { $url }
admin-link-button = Open the dashboard

payment-thanks = 🎉 Thank you! We received { $amount } ⭐ for “{ $title }”.
payment-thanks-generic = 🎉 Thank you! We received { $amount } ⭐.
payment-error-invalid = This invoice is no longer valid. Please start again.
payment-error-unavailable = Sorry, this product is no longer available.
payment-error-price-changed = The price has changed. Please open the product again.
payment-error-generic = The payment could not be processed. Please try again.

## EXAMPLE: onboarding wizard (apps/server/src/examples/onboarding)

onboarding-ask-name = What should I call you? Send me your name, or /cancel.
onboarding-name-invalid = Please send a name of 1 to 64 characters.
onboarding-ask-interest = Nice to meet you, <b>{ $name }</b>! What are you interested in?
onboarding-interest-news = 📰 News
onboarding-interest-deals = 🏷 Deals
onboarding-interest-both = ✨ Both
onboarding-confirm =
    Please confirm:
    Name: <b>{ $name }</b>
    Interest: <b>{ $interest }</b>
onboarding-confirm-yes = ✅ Save
onboarding-confirm-no = ↩️ Start over
onboarding-saved = 🎉 All set, { $name }! Your profile has been saved.
onboarding-restart = No problem, let's start over.
onboarding-use-buttons = Please use the buttons above, or /cancel.

## EXAMPLE: shop (apps/server/src/examples/shop)

shop-choose = 🛍 What would you like to buy?
shop-empty = Nothing is for sale right now.
