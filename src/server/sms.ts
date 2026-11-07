import { db } from './db.js';
import { randomUUID } from 'crypto';

interface TriggerEventParams {
  eventType: 'PROJECT_CREATED' | 'PROJECT_APPROVED' | 'PROJECT_REJECTED' | 'PROJECT_NEEDS_REVISION' | 'NEW_VOTE_CAST' | 'PASSWORD_RESET';
  project?: any;
  actor?: any;
  targetUserId?: string;
  extraData?: Record<string, string>;
}

// Format template with variables
export function formatSmsTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    const reg = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(reg, val || '');
  }
  return result;
}

// Send an SMS message through the configured provider
export async function sendSmsViaProvider(
  phone: string,
  message: string,
  settings: Record<string, string>
): Promise<{ success: boolean; providerResponse: string; simulated: boolean }> {
  const provider = settings.sms_provider || 'kavenegar';
  const apiKey = (settings.sms_api_key || '').trim();
  const senderNumber = settings.sms_sender_number || '10008585';
  const apiUrl = settings.sms_api_url || '';

  // If no API Key is configured, simulate successfully and log it
  if (!apiKey) {
    return {
      success: true,
      simulated: true,
      providerResponse: `ارسال شبیه‌سازی شده (کلید API پیامک تنظیم نشده است. گیرنده: ${phone})`,
    };
  }

  try {
    if (provider === 'kavenegar') {
      const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`;
      const params = new URLSearchParams({
        receptor: phone,
        sender: senderNumber,
        message,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json().catch(() => ({}));
      return {
        success: res.ok,
        simulated: false,
        providerResponse: JSON.stringify(data),
      };
    }

    if (provider === 'farazsms') {
      const url = 'https://ippanel.com/services.jspd';
      const params = {
        op: 'send',
        uname: apiKey.split(':')[0] || apiKey,
        pass: apiKey.split(':')[1] || '',
        from: senderNumber,
        to: JSON.stringify([phone]),
        message,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.text();
      return {
        success: res.ok,
        simulated: false,
        providerResponse: data,
      };
    }

    if (provider === 'smsir') {
      const url = 'https://api.sms.ir/v1/send/bulk';
      // Clean phone: ensure standard 09xx format
      const cleanPhone = phone.trim();
      const numOnlyLine = senderNumber.replace(/[^0-9]/g, '');
      const lineNumber = numOnlyLine ? Number(numOnlyLine) : 300000;

      const bodyPayload = {
        lineNumber,
        messageText: message,
        mobiles: [cleanPhone],
        sendDateTime: null,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json().catch(() => ({}));
      const isSuccess = res.ok && (data.status === 1 || data.status === '1' || data.isSuccess === true);

      return {
        success: isSuccess,
        simulated: false,
        providerResponse: JSON.stringify(data),
      };
    }

    if (provider === 'ghasedak') {
      const url = 'https://api.ghasedak.me/v2/sms/send/simple';
      const params = new URLSearchParams({
        message,
        receptor: phone.trim(),
        linenumber: senderNumber,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apikey': apiKey,
        },
        body: params.toString(),
      });
      const data = await res.json().catch(() => ({}));
      return {
        success: res.ok,
        simulated: false,
        providerResponse: JSON.stringify(data),
      };
    }

    if (provider === 'custom' && apiUrl) {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          phone,
          sender: senderNumber,
          message,
        }),
      });
      const data = await res.text();
      return {
        success: res.ok,
        simulated: false,
        providerResponse: data,
      };
    }

    // Default generic fallback
    return {
      success: true,
      simulated: true,
      providerResponse: `ارسال پیامک با موفقیت در صف درگاه ${provider} قرار گرفت.`,
    };
  } catch (err: any) {
    return {
      success: false,
      simulated: false,
      providerResponse: err.message || 'خطا در ارتباط با سرور پیامک',
    };
  }
}

// Main event dispatcher
export async function triggerSmsForEvent(params: TriggerEventParams): Promise<{ dispatchedCount: number; logs: any[] }> {
  const { eventType, project, actor, targetUserId, extraData } = params;

  // 1. Check if SMS is globally enabled
  const settingRows = db.prepare("SELECT key, value FROM system_settings WHERE key LIKE 'sms_%'").all() as any[];
  const settings: Record<string, string> = {};
  for (const row of settingRows) {
    settings[row.key] = row.value;
  }

  if (settings.sms_enabled === 'false') {
    return { dispatchedCount: 0, logs: [] };
  }

  // 2. Query active rules for this event
  const rules = db.prepare('SELECT * FROM sms_rules WHERE eventType = ? AND enabled = 1').all(eventType) as any[];
  if (!rules || rules.length === 0) {
    return { dispatchedCount: 0, logs: [] };
  }

  const now = new Date().toISOString();
  const dispatchedLogs: any[] = [];

  for (const rule of rules) {
    // Determine recipients
    const recipients: { phone: string; name?: string }[] = [];

    if (rule.targetType === 'ALL_COUNCIL') {
      const councilUsers = db.prepare("SELECT name, phone FROM users WHERE role = 'COUNCIL' AND phone IS NOT NULL AND phone != ''").all() as any[];
      councilUsers.forEach((u) => recipients.push({ phone: u.phone.trim(), name: u.name }));
    } else if (rule.targetType === 'ADMINS') {
      const adminUsers = db.prepare("SELECT name, phone FROM users WHERE role = 'ADMIN' AND phone IS NOT NULL AND phone != ''").all() as any[];
      adminUsers.forEach((u) => recipients.push({ phone: u.phone.trim(), name: u.name }));
    } else if (rule.targetType === 'PROJECT_CREATOR') {
      const creatorId = project?.authorId || project?.creatorId;
      if (creatorId) {
        const creator = db.prepare("SELECT name, phone FROM users WHERE id = ?").get(creatorId) as any;
        if (creator?.phone) {
          recipients.push({ phone: creator.phone.trim(), name: creator.name });
        }
      }
    } else if (rule.targetType === 'SPECIFIC_POSITIONS') {
      let posIds: string[] = [];
      try {
        posIds = JSON.parse(rule.targetPositionIds || '[]');
      } catch (e) {}
      if (posIds.length > 0) {
        const placeholders = posIds.map(() => '?').join(',');
        const posUsers = db.prepare(`SELECT name, phone FROM users WHERE positionId IN (${placeholders}) AND phone IS NOT NULL AND phone != ''`).all(...posIds) as any[];
        posUsers.forEach((u) => recipients.push({ phone: u.phone.trim(), name: u.name }));
      }
    } else if (rule.targetType === 'CUSTOM_NUMBERS') {
      const rawPhones = (rule.customPhones || '').split(/[,;\n\s]+/);
      rawPhones.forEach((p: string) => {
        const clean = p.trim();
        if (clean.length >= 10) {
          recipients.push({ phone: clean });
        }
      });
    }

    // Specific targetUser if passed (e.g. for password reset)
    if (targetUserId) {
      const targetUser = db.prepare("SELECT name, phone FROM users WHERE id = ?").get(targetUserId) as any;
      if (targetUser?.phone) {
        recipients.push({ phone: targetUser.phone.trim(), name: targetUser.name });
      }
    }

    // Deduplicate by phone
    const uniqueMap = new Map<string, string | undefined>();
    recipients.forEach((r) => {
      if (!uniqueMap.has(r.phone)) {
        uniqueMap.set(r.phone, r.name);
      }
    });

    // Format & dispatch
    for (const [phone, name] of uniqueMap.entries()) {
      const templateVars: Record<string, string> = {
        project_title: project?.title || 'طرح شورا',
        project_code: project?.code || '---',
        creator_name: project?.author || 'ثبت‌کننده طرح',
        recipient_name: name || 'همکار گرامی',
        actor_name: actor?.name || 'مدیر سامانه',
        status: project?.majorityResult || '',
        date: new Date().toLocaleDateString('fa-IR'),
        time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        ...(extraData || {}),
      };

      const finalMessage = formatSmsTemplate(rule.messageTemplate, templateVars);
      const sendResult = await sendSmsViaProvider(phone, finalMessage, settings);

      const logId = `sms-${randomUUID().substring(0, 8)}`;
      const status = sendResult.success ? (sendResult.simulated ? 'SIMULATED' : 'SENT') : 'FAILED';

      db.prepare(`
        INSERT INTO sms_logs (id, ruleId, recipientPhone, recipientName, message, eventType, status, providerResponse, sentAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId,
        rule.id,
        phone,
        name || null,
        finalMessage,
        eventType,
        status,
        sendResult.providerResponse,
        now
      );

      dispatchedLogs.push({
        id: logId,
        phone,
        name,
        message: finalMessage,
        status,
      });
    }
  }

  return { dispatchedCount: dispatchedLogs.length, logs: dispatchedLogs };
}
