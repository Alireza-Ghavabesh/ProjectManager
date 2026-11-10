import React, { useState } from 'react';
import {
  Send,
  Radio,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  ShieldAlert,
  HelpCircle,
  Code2,
} from 'lucide-react';
import { api } from '../services/api';

/**
 * کامپوننت اختصاصی، فوق‌العاده شفاف و تمیز برای تست ارسال پیامک و عیب‌یابی وب‌سرویس‌ها
 * این کامپوننت مستقیماً با سرور صحبت کرده و پاسخ خام قاصدک، هدرها و جزئیات ارور را درجا نمایش می‌دهد.
 */
export const SmsTestLab: React.FC = () => {
  // Provider Selection
  const [provider, setProvider] = useState<'ghasedak' | 'smsir' | 'kavenegar' | 'farazsms'>('ghasedak');
  const [method, setMethod] = useState<'all' | 'simple' | 'bulk2'>('simple');

  // Credentials & Payload
  const [apiKey, setApiKey] = useState('');
  const [senderNumber, setSenderNumber] = useState('90009729');
  const [phone, setPhone] = useState('09');
  const [message, setMessage] = useState('سلام، این یک پیامک آزمایشی از سامانه شورای ارزیابی است.');

  // UI & Response States
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<any>(null);

  // Load existing key from settings if empty
  const handleLoadSavedSettings = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.getSettings();
      const settings = res.settings || {};
      if (settings.sms_api_key) setApiKey(settings.sms_api_key);
      if (settings.sms_sender_number) setSenderNumber(settings.sms_sender_number);
      if (settings.sms_provider) setProvider(settings.sms_provider as any);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در بارگذاری تنظیمات ذخیره‌شده.');
    } finally {
      setLoading(false);
    }
  };

  // Perform Direct Diagnostic Test
  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 10) {
      setErrorMsg('شماره موبایل گیرنده معتبر نیست (حداقل ۱۰ یا ۱۱ رقم).');
      return;
    }
    if (!apiKey.trim()) {
      setErrorMsg('لطفاً کلید API (ApiKey) پنل را وارد کنید.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setRawResponse(null);

    try {
      const token = api.getToken();
      const res = await fetch('/api/sms/test-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          senderNumber: senderNumber.trim(),
          phone: phone.trim(),
          message: message.trim(),
          method: method === 'all' ? undefined : method,
        }),
      });

      const data = await res.json();
      if (!res.ok && data.error) {
        setErrorMsg(data.error);
      }
      setRawResponse(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطای غیرمنتظره در ارتباط با سرور برنامه.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold">
              <Terminal className="w-3.5 h-3.5" />
              <span>SMS Direct Diagnostic Laboratory</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              آزمایشگاه تست و خطایابی ارسال پیامک (قاصدک و سایر درگاه‌ها)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              این صفحه به صورت مستقل و بدون واسطه، کلید و درخواست شما را به وب‌سرویس ارسال می‌کند و پاسخ دقیق و کد وضعیت سرور را مو به مو به شما نشان می‌دهد تا علت ارورهایی نظیر ۴۱۹ فوراً مشخص شود.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLoadSavedSettings}
            disabled={loading}
            className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer backdrop-blur-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>بارگذاری کلید ذخیره‌شده از سامانه</span>
          </button>
        </div>
      </div>

      {/* Main Grid Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Main Configuration (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-black text-slate-900">تنظیمات و پارامترهای درخواست</h2>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              ارسال مستقیم
            </span>
          </div>

          <form onSubmit={handleRunTest} className="space-y-4">
            {/* Provider Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">انتخاب سرویس‌دهنده (Provider):</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'ghasedak', label: 'قاصدک (Ghasedak)' },
                  { id: 'smsir', label: 'SMS.ir' },
                  { id: 'kavenegar', label: 'کاوه‌نگار' },
                  { id: 'farazsms', label: 'فراز اس‌ام‌اس' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id as any)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition border cursor-pointer text-center ${
                      provider === p.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ghasedak Methods */}
            {provider === 'ghasedak' && (
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-indigo-600" />
                    روش ارسال به قاصدک (Endpoint Type):
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {[
                    { id: 'simple', title: '🎯 ارسال تکی به یک نفر (send/simple)' },
                    { id: 'bulk2', title: '👥 ارسال گروهی (send/bulk2)' },
                    { id: 'all', title: 'تست هر دو آدرس همزمان' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id as any)}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                        method === m.id
                          ? 'bg-white text-indigo-700 border-indigo-500 shadow-xs ring-1 ring-indigo-400'
                          : 'bg-indigo-100/40 text-indigo-900/70 border-indigo-200/50 hover:bg-white'
                      }`}
                    >
                      {m.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800">
                  کلید API (ApiKey):
                </label>
                <span className="text-[10px] text-slate-400">
                  طول کلید: {apiKey.length} کاراکتر
                </span>
              </div>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="کلید وب‌سرویس قاصدک را اینجا Paste کنید..."
                className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                dir="ltr"
                required
              />
            </div>

            {/* Sender Number & Target Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  شماره خط فرستنده (Sender):
                </label>
                <input
                  type="text"
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  placeholder="مثال: 90009729 (یا خالی برای پیش‌فرض)"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  dir="ltr"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  اگر خالی بگذارید، خود قاصدک خط پیش‌فرض را انتخاب می‌کند.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  شماره موبایل گیرنده تست (Receptor):
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912xxxxxxx"
                  className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            {/* Message Text */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">متن پیامک آزمایشی:</label>
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-indigo-500/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>در حال ارسال و استعلام پاسخ از وب‌سرویس...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>شروع ارسال تست و تحلیل پاسخ درجا</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Info Box / Explanations (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200 space-y-3">
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              <span>تنها ۲ آدرس رسمی فعال قاصدک</span>
            </h3>
            <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <span>
                  <strong>۱. ارسال تکی به یک نفر:</strong> <code>https://api.ghasedaksms.com/v2/sms/send/simple</code>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                <span>
                  <strong>۲. ارسال گروهی به چند نفر:</strong> <code>https://api.ghasedaksms.com/v2/sms/send/bulk2</code>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                <span>
                  <strong>فرمت استاندارد:</strong> ارسال با <code>x-www-form-urlencoded</code> و هدر <code>apikey</code>.
                </span>
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-3xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              <span>توصیه فنی:</span>
            </div>
            <p className="leading-relaxed text-[11px] text-amber-800">
              یک‌بار با گذاشتن شماره <code>90009729</code> تست کنید، و یک‌بار هم کادر «شماره خط فرستنده» را کاملاً خالی بگذارید و دکمه تست را بزنید تا تفاوت رفتار وب‌سرویس را در نتایج زیر مشاهده کنید.
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Response Output */}
      {rawResponse && (
        <div className="bg-slate-900 rounded-3xl p-6 text-white border border-slate-800 shadow-xl space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black text-white">پاسخ کامل و تفصیلی سرور پیامک (Live Response)</h3>
            </div>
            {rawResponse.overallSuccess ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>پیامک با موفقیت ارسال شد</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold">
                <XCircle className="w-3.5 h-3.5" />
                <span>خطا در ارسال</span>
              </span>
            )}
          </div>

          {/* Server Outbound IP banner */}
          {rawResponse.diagnostics?.serverOutboundIp && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">آی‌پی خروجی سرور برنامه (Outbound IP):</span>
                <span className="font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-md select-all">
                  {rawResponse.diagnostics.serverOutboundIp}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                💡 نکته: در پنل قاصدک اگر فیلد IP را کاملاً خالی بگذارید، محدودیت IP برداشته می‌شود.
              </span>
            </div>
          )}

          {/* If Ghasedak multi-attempt output */}
          {Array.isArray(rawResponse.attempts) ? (
            <div className="space-y-4">
              {rawResponse.attempts.map((att: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border ${
                    att.isSuccess
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-100'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-700/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-white">{att.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-950 text-slate-400">
                        HTTP {att.status} {att.statusText}
                      </span>
                    </div>
                    {att.durationMs !== undefined && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        زمان پاسخ: {att.durationMs}ms
                      </span>
                    )}
                  </div>

                  {/* Target Endpoint URL display */}
                  <div className="mb-3 p-2 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono flex items-center gap-2 text-sky-300" dir="ltr">
                    <span className="text-slate-500 shrink-0 text-[10px]">URL:</span>
                    <span className="select-all break-all">{att.endpoint}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono" dir="ltr">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 font-sans">هدرها و دیتای ارسال‌شده (Sent Payload):</div>
                      <pre className="p-2.5 rounded-xl bg-slate-950 text-slate-300 text-[11px] overflow-x-auto max-h-36">
                        {JSON.stringify(att.payloadSent, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 font-sans">
                        <span>پاسخ دریافتی (Raw Response Body):</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(JSON.stringify(att.responseBody, null, 2), idx)}
                          className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span className="text-[9px]">کپی JSON</span>
                        </button>
                      </div>
                      <pre className="p-2.5 rounded-xl bg-slate-950 text-amber-300 text-[11px] overflow-x-auto max-h-36">
                        {typeof att.responseBody === 'object'
                          ? JSON.stringify(att.responseBody, null, 2)
                          : String(att.responseBody)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div dir="ltr">
              <pre className="p-4 rounded-2xl bg-slate-950 text-amber-300 font-mono text-xs overflow-x-auto max-h-72">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default SmsTestLab;
