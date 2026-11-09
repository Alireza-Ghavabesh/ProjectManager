#!/usr/bin/env node

/**
 * اسکریپت تست مستقیم قاصدک از روی سیستم محلی (بدون نیاز به اجرای سرور)
 * این اسکریپت از آی‌پی اینترنت فعلی سیستم شما مستقیماً به قاصدک وصل می‌شود.
 * 
 * نحوه اجرا در ترمینال سیستم خودتان:
 * node scripts/test-ghasedak-local.js --key=YOUR_API_KEY --phone=0912xxxxxxx
 * 
 * یا به صورت ساده:
 * node scripts/test-ghasedak-local.js YOUR_API_KEY 0912xxxxxxx
 */

import Ghasedak from 'ghasedaksms';

const args = process.argv.slice(2);
let apiKey = '';
let phone = '';
let sender = '90009729';

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--key=')) {
    apiKey = arg.split('=')[1];
  } else if (arg === '--key' || arg === '-k') {
    apiKey = args[++i] || '';
  } else if (arg.startsWith('--phone=')) {
    phone = arg.split('=')[1];
  } else if (arg === '--phone' || arg === '-p') {
    phone = args[++i] || '';
  } else if (arg.startsWith('--sender=')) {
    sender = arg.split('=')[1];
  } else if (!arg.startsWith('-')) {
    if (!apiKey) apiKey = arg;
    else if (!phone) phone = arg;
  }
}

console.log('======================================================');
console.log('🔍 تست مستقیم وب‌سرویس قاصدک از روی اینترنت سیستم محلی');
console.log('======================================================\n');

if (!apiKey || !phone) {
  console.log('❌ خطا: کلید API یا شماره همراه وارد نشده است!\n');
  console.log('📖 نحوه اجرا:');
  console.log('  node scripts/test-ghasedak-local.js <API_KEY> <شماره_موبایل>\n');
  console.log('💡 مثال:');
  console.log('  node scripts/test-ghasedak-local.js 123456789abcdef 09121112233\n');
  process.exit(1);
}

// 1. نمایش آی‌پی عمومی اینترنت شما
try {
  console.log('🌐 در حال بررسی آی‌پی عمومی اینترنت سیستم شما...');
  const ipRes = await fetch('https://api.ipify.org?format=json').then(r => r.json()).catch(() => ({ ip: 'نامشخص' }));
  console.log(`👉 آی‌پی سیستم شما: ${ipRes.ip}`);
  console.log('   (اگر در پنل قاصدک محدودیت IP گذاشته‌اید، باید این IP یا خالی باشد)\n');
} catch (e) {}

const message = `تست مستقیم قاصدک از سیستم محلی\nزمان: ${new Date().toLocaleTimeString('fa-IR')}`;

console.log('------------------------------------------------------');
console.log(`🔑 کلید تست: ${apiKey.slice(0, 5)}...${apiKey.slice(-5)} (طول: ${apiKey.length})`);
console.log(`📱 گیرنده: ${phone}`);
console.log(`🔢 خط فرستنده: ${sender}`);
console.log('------------------------------------------------------\n');

// تست روش ۱: پکیج رسمی Node.js (ghasedaksms)
console.log('⏳ ۱. در حال تست با پکیج رسمی Node.js (ghasedaksms)...');
try {
  const ghasedak = new Ghasedak(apiKey);
  const sdkPayload = {
    message,
    receptor: phone,
    linenumber: sender,
    sendDate: new Date().toISOString(),
  };

  const res1 = await ghasedak.sendSimpleSms(sdkPayload);
  console.log('✅ پاسخ پکیج رسمی ghasedaksms:');
  console.log(res1);
} catch (err) {
  console.error('❌ خطای پکیج رسمی ghasedaksms:');
  console.error(err.response ? { status: err.response.status, data: err.response.data } : err.message);
}

// تست روش ۲: متد مستقیم رسمی REST v1
console.log('\n⏳ ۲. در حال تست متد مستقیم SendSingleSMS (gateway.ghasedak.me)...');
try {
  const res2 = await fetch('https://gateway.ghasedak.me/rest/api/v1/WebService/SendSingleSMS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ApiKey': apiKey,
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      message,
      receptor: phone,
      lineNumber: sender,
      ApiKey: apiKey,
    }),
  });

  const text2 = await res2.text();
  console.log(`📊 کد HTTP: ${res2.status} ${res2.statusText}`);
  console.log('پاسخ سرور:');
  console.log(text2);
} catch (err) {
  console.error('❌ خطا:', err.message);
}

// تست روش ۳: متد بدون تعیین خط فرستنده (خط پیش‌فرض سامانه)
console.log('\n⏳ ۳. در حال تست بدون شماره خط (انتخاب خودکار خط پیش‌فرض توسط قاصدک)...');
try {
  const res3 = await fetch('https://gateway.ghasedak.me/rest/api/v1/WebService/SendSingleSMS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ApiKey': apiKey,
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      message,
      receptor: phone,
      ApiKey: apiKey,
    }),
  });

  const text3 = await res3.text();
  console.log(`📊 کد HTTP: ${res3.status} ${res3.statusText}`);
  console.log('پاسخ سرور:');
  console.log(text3);
} catch (err) {
  console.error('❌ خطا:', err.message);
}

console.log('\n======================================================');
console.log('🏁 تست به پایان رسید.');
console.log('======================================================\n');
