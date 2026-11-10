#!/usr/bin/env node

/**
 * اسکریپت تست مستقیم قاصدک از روی سیستم محلی (بدون نیاز به پکیج‌های اضافی)
 * فقط با ۲ آدرس رسمی اعلام‌شده:
 * ۱. https://api.ghasedaksms.com/v2/sms/send/simple (ارسال تکی به یک نفر)
 * ۲. https://api.ghasedaksms.com/v2/sms/send/bulk2 (ارسال گروهی به چند نفر)
 * 
 * نحوه اجرا در ترمینال سیستم خودتان:
 * node scripts/test-ghasedak-local.js --key=YOUR_API_KEY --phone=0912xxxxxxx
 * 
 * یا به صورت ساده:
 * node scripts/test-ghasedak-local.js YOUR_API_KEY 0912xxxxxxx
 */

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
console.log('🔍 تست اختصاصی وب‌سرویس قاصدک (Send Simple & Bulk2)');
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
  console.log(`👉 آی‌پی اینترنت فعلی شما: ${ipRes.ip}`);
  console.log('   (در پنل قاصدک اگر فیلد IP را خالی بگذارید، محدودیت IP به طور کلی غیرفعال می‌شود)\n');
} catch (e) {}

const message = `تست سامانه شورای ارزیابی\nزمان: ${new Date().toLocaleTimeString('fa-IR')}`;

console.log('------------------------------------------------------');
console.log(`🔑 کلید تست: ${apiKey.slice(0, 5)}...${apiKey.slice(-5)} (طول: ${apiKey.length})`);
console.log(`📱 گیرنده: ${phone}`);
console.log(`🔢 خط فرستنده: ${sender || '(خط پیش‌فرض)'}`);
console.log('------------------------------------------------------\n');

// تست ۱: ارسال تکی به یک نفر (send/simple)
console.log('⏳ ۱. 🎯 در حال تست ارسال تکی به یک نفر: https://api.ghasedaksms.com/v2/sms/send/simple ...');
try {
  const params1 = new URLSearchParams({
    message,
    receptor: phone,
  });
  if (sender && sender !== '10008585' && sender !== 'default') {
    params1.append('linenumber', sender);
    params1.append('sender', sender);
  }

  const res1 = await fetch('https://api.ghasedaksms.com/v2/sms/send/simple', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'apikey': apiKey,
      'ApiKey': apiKey,
      'Accept': 'application/json',
    },
    body: params1.toString(),
  });
  const text1 = await res1.text();
  console.log(`📊 کد HTTP روش send/simple: ${res1.status} ${res1.statusText}`);
  console.log('پاسخ سرور قاصدک:');
  console.log(text1);
} catch (err) {
  console.error('❌ خطای ارتباط با send/simple:', err.message);
}

// تست ۲: ارسال گروهی (send/bulk2)
console.log('\n⏳ ۲. 👥 در حال تست ارسال گروهی: https://api.ghasedaksms.com/v2/sms/send/bulk2 ...');
try {
  const params2 = new URLSearchParams({
    message,
    receptor: phone,
  });
  if (sender && sender !== '10008585' && sender !== 'default') {
    params2.append('linenumber', sender);
    params2.append('sender', sender);
  }

  const res2 = await fetch('https://api.ghasedaksms.com/v2/sms/send/bulk2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'apikey': apiKey,
      'ApiKey': apiKey,
      'Accept': 'application/json',
    },
    body: params2.toString(),
  });
  const text2 = await res2.text();
  console.log(`📊 کد HTTP روش send/bulk2: ${res2.status} ${res2.statusText}`);
  console.log('پاسخ سرور قاصدک:');
  console.log(text2);
} catch (err) {
  console.error('❌ خطای ارتباط با send/bulk2:', err.message);
}

console.log('\n======================================================');
console.log('🏁 تست هر ۲ آدرس رسمی قاصدک به پایان رسید.');
console.log('======================================================\n');
