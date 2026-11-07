-- ====================================================================
-- اسکریپت مایگریشن امن برای ارتقای دیتابیس قدیمی به نسخه جدید سامانه
-- این اسکریپت هیچ‌گونه داده قبلی (پروژه‌ها، کاربران، آرا، گردش‌کار و پیام‌ها) را حذف نمی‌کند
-- و فقط جداول و ستون‌های جدید را به دیتابیس اضافه می‌کند.
-- ====================================================================

-- ۱. ایجاد جدول درخواست‌های تغییر و بازیابی رمز عبور (در صورت عدم وجود)
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  userId TEXT REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  fullName TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  newPassword TEXT,
  adminNote TEXT,
  requestedAt TEXT NOT NULL,
  resolvedAt TEXT,
  resolvedBy TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- ۲. ایجاد جدول شرط‌های هوشمند ارسال پیامک (در صورت عدم وجود)
CREATE TABLE IF NOT EXISTS sms_rules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  eventType TEXT NOT NULL,
  targetType TEXT NOT NULL,
  targetPositionIds TEXT,
  customPhones TEXT,
  messageTemplate TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

-- ۳. ایجاد جدول تاریخچه لاگ‌های پیامک (در صورت عدم وجود)
CREATE TABLE IF NOT EXISTS sms_logs (
  id TEXT PRIMARY KEY,
  ruleId TEXT,
  recipientPhone TEXT NOT NULL,
  recipientName TEXT,
  message TEXT NOT NULL,
  eventType TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SENT',
  providerResponse TEXT,
  sentAt TEXT NOT NULL
);

-- ۴. ایجاد جدول تنظیمات سیستم (در صورت عدم وجود)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updatedAt TEXT NOT NULL
);

-- ۵. ایجاد جدول ساختارهای پروژه (در صورت عدم وجود)
CREATE TABLE IF NOT EXISTS project_structures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT,
  category TEXT DEFAULT 'تولید تلویزیونی',
  defaultWorkflowId TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  orderIndex INTEGER DEFAULT 0,
  isActive INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL
);

-- ۶. ایجاد جدول سمت‌های هر ساختار (در صورت عدم وجود)
CREATE TABLE IF NOT EXISTS structure_positions (
  id TEXT PRIMARY KEY,
  structureId TEXT NOT NULL REFERENCES project_structures(id) ON DELETE CASCADE,
  positionId TEXT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  color TEXT,
  parentId TEXT REFERENCES structure_positions(id) ON DELETE SET NULL,
  orderIndex INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL
);

-- ۷. ایجاد جدول انتصاب کاربران به سمت‌های ساختار (در صورت عدم وجود)
CREATE TABLE IF NOT EXISTS structure_position_users (
  id TEXT PRIMARY KEY,
  structurePositionId TEXT NOT NULL REFERENCES structure_positions(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignedAt TEXT NOT NULL,
  UNIQUE(structurePositionId, userId)
);

-- ۸. درج تنظیمات پیش‌فرض جدید (تنها در صورتی که از قبل وجود نداشته باشند)
INSERT OR IGNORE INTO system_settings (key, value, description, updatedAt) VALUES
  ('login_title', 'شورای تولید و ارزیابی', 'عنوان بالای فرم ورود به سامانه', datetime('now')),
  ('login_subtitle', 'سامانه جامع کارتابل مصوبات و مدیریت طرح‌ها', 'توضیحات و زیرعنوان فرم ورود', datetime('now')),
  ('login_logo_url', '', 'آدرس تصویر یا لوگوی اختصاصی صفحه ورود', datetime('now')),
  ('sms_enabled', 'true', 'فعال بودن کلی سامانه ارسال پیامک', datetime('now')),
  ('sms_provider', 'smsir', 'ارائه‌دهنده وب‌سرویس پیامک (smsir, kavenegar, farazsms, ghasedak, custom)', datetime('now')),
  ('sms_api_key', '', 'کلید دسترسی API ارائه‌دهنده پیامک', datetime('now')),
  ('sms_sender_number', '10008585', 'شماره خط اختصاصی ارسال‌کننده پیامک', datetime('now')),
  ('sms_api_url', '', 'آدرس وب‌سرویس در صورت استفاده از ارائه‌دهنده سفارشی', datetime('now')),
  ('enforce_deadline', 'true', 'قفل خودکار ثبت رای پس از اتمام مهلت ارزیابی پروژه', datetime('now')),
  ('default_deadline_days', '14', 'تعداد روزهای پیش‌فرض مهلت ارزیابی', datetime('now')),
  ('allow_creator_extension', 'true', 'امکان تمدید مهلت ارزیابی توسط ایجادکننده طرح', datetime('now')),
  ('max_file_size_mb', '1024', 'سقف مجاز حجم هر فایل پیوست بر حسب مگابایت (تا ۱۰ گیگابایت)', datetime('now'));
