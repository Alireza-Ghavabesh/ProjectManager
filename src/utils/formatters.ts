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
