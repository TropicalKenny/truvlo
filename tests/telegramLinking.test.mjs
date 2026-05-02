import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const createInvoiceMetaSource = await readFile('api/create-invoice-meta.ts', 'utf8');
const telegramSource = await readFile('api/_telegram.ts', 'utf8');
const vercelConfigSource = await readFile('vercel.json', 'utf8');
const migrationSource = await readFile('supabase/migrations/20260502_telegram_notifications.sql', 'utf8');
const accountSource = await readFile('src/pages/AccountPage.tsx', 'utf8');
const notifyClientSource = await readFile('api/notify-client.ts', 'utf8');
const notifyCreatorSource = await readFile('api/notify-creator.ts', 'utf8');
const agentCommerceSource = await readFile('api/_agent-commerce.ts', 'utf8');

assert.match(createInvoiceMetaSource, /handleTelegramLink/, 'consolidated API should dispatch telegram link route');
assert.match(createInvoiceMetaSource, /handleTelegramWebhook/, 'consolidated API should dispatch telegram webhook route');
assert.match(vercelConfigSource, /telegram-link.*create-invoice-meta/s, 'telegram link route should be rewritten into the consolidated function');
assert.match(vercelConfigSource, /telegram-webhook.*create-invoice-meta/s, 'telegram webhook route should be rewritten into the consolidated function');

assert.match(telegramSource, /TELEGRAM_BOT_TOKEN/, 'telegram integration should require bot token env');
assert.match(telegramSource, /TELEGRAM_BOT_USERNAME/, 'telegram integration should build deep links from bot username');
assert.match(telegramSource, /X-Telegram-Bot-Api-Secret-Token/i, 'telegram webhook should verify Telegram secret header');
assert.match(telegramSource, /telegram_link_codes/, 'telegram link route should store pending link codes');
assert.match(telegramSource, /telegram_links/, 'telegram webhook should store linked chat ids');
assert.match(telegramSource, /\/start\s+\$\{code\}/, 'telegram deep link flow should expect start payload codes');
assert.match(telegramSource, /sendTelegramMessage/, 'telegram helper should send bot messages');
assert.match(telegramSource, /sendTelegramToPrivyId/, 'telegram helper should send user-specific notifications');

assert.match(migrationSource, /create table if not exists telegram_links/, 'migration should create telegram_links');
assert.match(migrationSource, /telegram_chat_id text not null unique/, 'telegram chat id should be unique');
assert.match(migrationSource, /create table if not exists telegram_link_codes/, 'migration should create pending telegram link codes');
assert.match(migrationSource, /expires_at timestamptz not null/, 'telegram link codes should expire');
assert.match(migrationSource, /alter table telegram_links enable row level security/, 'telegram links should have RLS enabled');
assert.match(migrationSource, /alter table telegram_link_codes enable row level security/, 'telegram link codes should have RLS enabled');

assert.match(accountSource, /Connect Telegram/, 'account page should expose Telegram linking');
assert.match(accountSource, /\/api\/telegram-link/, 'account page should call telegram link API');
assert.match(accountSource, /telegramLink/, 'account page should track Telegram linked state');
assert.match(accountSource, /window\.location\.href = data\.deep_link/, 'account page should navigate to Telegram deep link');
assert.match(accountSource, /telegramConnectAttempt/, 'account page should show a fallback code if Telegram does not open the bot');

assert.match(notifyClientSource, /sendTelegramToPrivyId/, 'client withdrawal notifications should also attempt Telegram');
assert.match(notifyCreatorSource, /sendTelegramToPrivyId/, 'creator notifications should also attempt Telegram');
assert.match(agentCommerceSource, /sendTelegramToPrivyId/, 'agent verification events should notify clients through Telegram');

console.log('telegram linking tests passed');
