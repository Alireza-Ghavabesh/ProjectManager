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
 * Get current Jalali date
 */
export function getTodayJalali(): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date());
    const year = parseInt(parts.find((p) => p.type === 'year')?.value || '1403', 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value || '8', 10);
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);
    return { year, month, day };
  } catch (e) {
    return { year: 1403, month: 8, day: 1 };
  }
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
