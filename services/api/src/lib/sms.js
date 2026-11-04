// SMS gateway with three modes (SMS_MODE): auto | twilio | simulate.
// Every attempt is written to the smslogs collection so the dashboards can show an outbox,
// which also makes demos work without a paid Twilio account.
import twilio from 'twilio';
import { config } from '../config.js';
import { SmsLog } from '../models/index.js';

let client = null;
const hasCreds = () => Boolean(config.sms.accountSid && config.sms.authToken && config.sms.from);

function getClient() {
  if (!client && hasCreds()) client = twilio(config.sms.accountSid, config.sms.authToken);
  return client;
}

export function smsStatus() {
  return { mode: config.sms.mode, twilioConfigured: hasCreds() };
}

export function normalizePhone(raw) {
  if (!raw) return '';
  const s = String(raw).replace(/[^+\d]/g, '');
  if (s.startsWith('+')) return s;
  if (s.length === 10) return `+91${s}`; // default to India
  return `+${s}`;
}

/**
 * Send one SMS.
 * @param {{to:string, body:string, context?:string, forceSimulate?:boolean}} opts
 * @returns {Promise<{status:'sent'|'simulated'|'failed', isMock:boolean, sid?:string, error?:string}>}
 */
export async function sendSms({ to, body, context = 'general', forceSimulate = false, strict = false }) {
  const phone = normalizePhone(to);
  const mode = config.sms.mode;
  const simulate = !strict && (forceSimulate || mode === 'simulate' || (mode === 'auto' && !hasCreds()));
  if (strict && !hasCreds()) return { status: 'failed', isMock: false, error: 'Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)' };

  if (simulate) {
    await SmsLog.create({ to: phone, body, status: 'simulated', provider: 'simulator', context });
    console.log(`[sms:simulated] -> ${phone}: ${body}`);
    return { status: 'simulated', isMock: true };
  }

  try {
    const msg = await getClient().messages.create({ body, from: config.sms.from, to: phone });
    await SmsLog.create({ to: phone, body, status: 'sent', provider: 'twilio', sid: msg.sid, context });
    return { status: 'sent', isMock: false, sid: msg.sid };
  } catch (err) {
    const error = `${err.code ? `[${err.code}] ` : ''}${err.message || err}`;
    if (mode === 'auto' && !strict) {
      // e.g. Twilio trial accounts can only text verified numbers (code 21608) – degrade gracefully.
      await SmsLog.create({ to: phone, body, status: 'simulated', provider: 'simulator', error, context });
      console.warn(`[sms] Twilio failed (${error}); simulated instead -> ${phone}`);
      return { status: 'simulated', isMock: true, error };
    }
    await SmsLog.create({ to: phone, body, status: 'failed', provider: 'twilio', error, context });
    return { status: 'failed', isMock: false, error };
  }
}


/**
 * Twilio trial helper for the officer "SMS setup" panel: account type, sender number and the
 * phone numbers verified in the Twilio console (a trial account can only text those).
 */
export async function twilioSetup() {
  const out = { configured: hasCreds(), mode: config.sms.mode, from: config.sms.from || null, accountType: null, status: null, verifiedNumbers: [], error: null };
  if (!hasCreds()) return out;
  try {
    const c = getClient();
    const acc = await c.api.v2010.accounts(config.sms.accountSid).fetch();
    out.accountType = acc.type; // "Trial" | "Full"
    out.status = acc.status;
    const ids = await c.outgoingCallerIds.list({ limit: 50 });
    out.verifiedNumbers = ids.map((i) => i.phoneNumber);
  } catch (e) {
    out.error = `${e.code ? `[${e.code}] ` : ''}${e.message}`;
  }
  return out;
}
