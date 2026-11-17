/**
 * Persian & English number formatters and currency utilities
 */

// Convert Persian digits to English digits
export function toEnglishDigits(str: string): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/[۰-۹]/g, (w) => String(persianDigits.indexOf(w)));
}

// Convert English digits to Persian digits
export function toPersianDigits(str: string | number): string {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(str).replace(/[0-9]/g, (w) => persianDigits[Number(w)]);
}

/**
 * Format string while user is typing in a currency input field (adds comma separators)
 */
export function formatCurrencyInput(value: string): string {
  if (!value) return '';
  // Convert Persian numbers to English first, remove non-digits
  const clean = toEnglishDigits(value).replace(/[^\d]/g, '');
  if (!clean) return '';
  const num = parseInt(clean, 10);
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US'); // e.g. "150,000,000"
}

/**
 * Format budget for display in cards, modals, tables (with commas and "تومان" suffix)
 */
export function formatBudgetDisplay(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return 'ثبت نشده';
  
  const rawStr = String(value);
  // Extract digits
  const engStr = toEnglishDigits(rawStr);
  const digitsOnly = engStr.replace(/[^\d]/g, '');
  
  if (!digitsOnly) {
    // If no digits found, show raw string trimmed with "تومان"
    const cleaned = rawStr.replace(/تومان/g, '').trim();
    return cleaned ? `${cleaned} تومان` : 'ثبت نشده';
  }

  const num = parseInt(digitsOnly, 10);
  if (isNaN(num)) return `${rawStr} تومان`;

  // Return formatted with Persian commas and "تومان" suffix
  return `${toPersianDigits(num.toLocaleString('en-US'))} تومان`;
}

/**
 * Parse a Persian date like ۱۴۰۳/۰۹/۳۰ or 1403/09/30 into numbers
 */
export function parsePersianDate(dateStr?: string | null): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const cleaned = toEnglishDigits(String(dateStr)).trim();
  const parts = cleaned.split(/[\/\-\.]/).map((p) => parseInt(p, 10));
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    let year = parts[0];
    if (year < 100) year += 1400;
    const month = Math.min(12, Math.max(1, parts[1]));
    const day = Math.min(31, Math.max(1, parts[2]));
    return { year, month, day };
  }
  return null;
}

/**
 * Convert a Gregorian Date object to Jalali year, month, day
 */
export function getJalaliFromDate(date: Date): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(date);
    const year = parseInt(parts.find((p) => p.type === 'year')?.value || '1405', 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);
    return { year, month, day };
  } catch (e) {
    return { year: 1405, month: 1, day: 1 };
  }
}

export function isJalaliLeapYear(jy: number): boolean {
  return (((((jy - (jy > 0 ? 474 : 473)) % 2820) + 474) + 38) * 682) % 2816 < 682;
}

export function getJalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

export function formatJalaliDate(year: number, month: number, day: number, inFarsiDigits = true): string {
  const m = month < 10 ? `0${month}` : `${month}`;
  const d = day < 10 ? `0${day}` : `${day}`;
  const formatted = `${year}/${m}/${d}`;
  return inFarsiDigits ? toPersianDigits(formatted) : formatted;
}

/**
 * Get current Jalali date
 */
export function getTodayJalali(): { year: number; month: number; day: number } {
  return getJalaliFromDate(new Date());
}

/**
 * Default project evaluation deadline: 1 week (7 days) from now in Jalali YYYY/MM/DD
 */
export function getDefaultEvaluationDeadlineJalali(baseDate: Date = new Date()): string {
  const nextWeek = new Date(baseDate.getTime());
  nextWeek.setDate(nextWeek.getDate() + 7);
  const { year, month, day } = getJalaliFromDate(nextWeek);
  return formatJalaliDate(year, month, day, true);
}

/**
 * Default project delivery date: 1 Jalali year from now in Jalali YYYY/MM/DD
 */
export function getDefaultDeliveryDateJalali(baseDate: Date = new Date()): string {
  const today = getJalaliFromDate(baseDate);
  const nextYear = today.year + 1;
  const maxDay = getJalaliMonthLength(nextYear, today.month);
  const day = Math.min(today.day, maxDay);
  return formatJalaliDate(nextYear, today.month, day, true);
}

/**
 * Checks if a project deadline has expired (today is past the deadline date)
 */
export function isDeadlineExpired(deadlineStr?: string | null): boolean {
  if (!deadlineStr || !deadlineStr.trim()) return false;
  const parsed = parsePersianDate(deadlineStr);
  if (!parsed) {
    const d = new Date(deadlineStr);
    if (!isNaN(d.getTime())) {
      return d.getTime() < Date.now();
    }
    return false;
  }
  const today = getTodayJalali();
  if (parsed.year < today.year) return true;
  if (parsed.year > today.year) return false;
  if (parsed.month < today.month) return true;
  if (parsed.month > today.month) return false;
  return parsed.day < today.day;
}
