import { randomBytes } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUserId, supabase } from './_shared.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

type TelegramLinkRow = {
  privy_id: string;
  telegram_chat_id: string;
  telegram_username: string | null;
  telegram_first_name: string | null;
  linked_at: string;
  updated_at: string;
};

function generateTelegramCode() {
  return `TRUVLO-${randomBytes(5).toString('hex').toUpperCase()}`;
}

function getTelegramBotUsername() {
  return TELEGRAM_BOT_USERNAME?.replace(/^@/, '').trim();
}

function telegramConfigured() {
  return Boolean(TELEGRAM_BOT_TOKEN && getTelegramBotUsername());
}

function buildTelegramDeepLink(code: string) {
  const username = getTelegramBotUsername();
  if (!username) return null;
  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(code)}`;
}

function getTelegramSecretHeader(req: VercelRequest) {
  const value = req.headers['x-telegram-bot-api-secret-token'];
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeTelegramText(text: string) {
  return text.replace(/[<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[char] ?? char));
}

export async function sendTelegramMessage(chatId: string, text: string, inlineUrl?: string) {
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, skipped: true };
  const reply_markup = inlineUrl
    ? { inline_keyboard: [[{ text: 'Open Truvlo', url: inlineUrl }]] }
    : undefined;
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(reply_markup ? { reply_markup } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('Telegram sendMessage failed:', body);
    return { ok: false, skipped: false };
  }
  return { ok: true, skipped: false };
}

export async function sendTelegramToPrivyId(input: {
  privyId: string | null | undefined;
  title: string;
  body: string;
  url?: string;
}) {
  if (!input.privyId || !TELEGRAM_BOT_TOKEN) return { ok: false, skipped: true };
  const { data, error } = await supabase
    .from('telegram_links')
    .select('telegram_chat_id')
    .eq('privy_id', input.privyId)
    .maybeSingle();
  if (error || !data?.telegram_chat_id) return { ok: false, skipped: true };

  const text = `<b>${sanitizeTelegramText(input.title)}</b>\n\n${sanitizeTelegramText(input.body)}`;
  return sendTelegramMessage(data.telegram_chat_id as string, text, input.url);
}

export async function handleTelegramLink(req: VercelRequest, res: VercelResponse) {
  const privyId = await requireUserId(req);
  if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('telegram_links')
      .select('privy_id, telegram_chat_id, telegram_username, telegram_first_name, linked_at, updated_at')
      .eq('privy_id', privyId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      configured: telegramConfigured(),
      bot_username: getTelegramBotUsername() ?? null,
      telegram_link: data as TelegramLinkRow | null,
    });
  }

  if (req.method === 'POST') {
    if (!telegramConfigured()) return res.status(500).json({ error: 'Telegram bot is not configured' });
    const code = generateTelegramCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('telegram_link_codes')
      .insert({ privy_id: privyId, code, expires_at: expiresAt });
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      code,
      expires_at: expiresAt,
      deep_link: buildTelegramDeepLink(code),
      instructions: `Open Telegram and tap Start. The bot receives /start ${code} automatically from the deep link.`,
    });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('telegram_links')
      .delete()
      .eq('privy_id', privyId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export async function handleTelegramWebhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!TELEGRAM_BOT_TOKEN) return res.status(200).json({ ok: true, skipped: true });
  if (TELEGRAM_WEBHOOK_SECRET && getTelegramSecretHeader(req) !== TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid Telegram webhook secret' });
  }

  const message = req.body?.message;
  const chatId = message?.chat?.id ? String(message.chat.id) : '';
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const startCode = text.match(/^\/start\s+([A-Za-z0-9_-]{6,64})/)?.[1] ?? null;
  const rawCode = text.match(/^(TRUVLO-[A-F0-9]{10})$/i)?.[1] ?? null;
  const code = startCode ?? rawCode;
  if (!chatId) return res.status(200).json({ ok: true });
  if (!code) {
    if (text === '/start') {
      await sendTelegramMessage(chatId, 'Open Truvlo, tap Connect Telegram, then send the full TRUVLO code shown on your Account page.');
    }
    return res.status(200).json({ ok: true });
  }

  const { data: linkCode, error: codeError } = await supabase
    .from('telegram_link_codes')
    .select('id, privy_id, expires_at, used_at')
    .eq('code', code)
    .maybeSingle();
  if (codeError || !linkCode || linkCode.used_at || new Date(linkCode.expires_at as string).getTime() <= Date.now()) {
    await sendTelegramMessage(chatId, 'This Truvlo linking code is invalid or expired. Open Truvlo and tap Connect Telegram again.');
    return res.status(200).json({ ok: true });
  }

  const from = message?.from ?? {};
  const { error: upsertError } = await supabase
    .from('telegram_links')
    .upsert({
      privy_id: linkCode.privy_id,
      telegram_chat_id: chatId,
      telegram_username: typeof from.username === 'string' ? from.username : null,
      telegram_first_name: typeof from.first_name === 'string' ? from.first_name : null,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'privy_id' });
  if (upsertError) {
    console.error('Telegram link upsert failed:', upsertError);
    return res.status(500).json({ error: 'Telegram link failed' });
  }

  await supabase
    .from('telegram_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', linkCode.id);

  await sendTelegramMessage(chatId, 'Telegram connected to Truvlo. You will receive invoice, proof, and agent escrow alerts here.');
  return res.status(200).json({ ok: true });
}
