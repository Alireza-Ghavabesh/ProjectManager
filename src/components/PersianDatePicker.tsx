import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronRight, ChevronLeft, X, Sparkles, Check } from 'lucide-react';

interface PersianDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const PERSIAN_WEEKDAYS = [
  { label: 'ش', name: 'شنبه' },
  { label: 'ی', name: 'یکشنبه' },
  { label: 'د', name: 'دوشنبه' },
  { label: 'س', name: 'سه‌شنبه' },
  { label: 'چ', name: 'چهارشنبه' },
  { label: 'پ', name: 'پنج‌شنبه' },
  { label: 'ج', name: 'جمعه', isWeekend: true },
];

export function toPersianDigits(n: number | string): string {
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/[0-9]/g, (w) => farsiDigits[parseInt(w, 10)]);
}

export function toEnglishDigits(str: string): string {
  const farsiDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.replace(farsiDigits[i], String(i));
  }
  return res;
}

export function isJalaliLeapYear(jy: number): boolean {
  return (((((jy - (jy > 0 ? 474 : 473)) % 2820) + 474) + 38) * 682) % 2816 < 682;
}

export function getJalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

function div(a: number, b: number) {
  return Math.trunc(a / b);
}

function jalaliToJulianDay(jy: number, jm: number, jd: number): number {
  const base = jy - 474;
  const julian = 474 + (base % 2820);
  const jdn =
    1948320.5 +
    Math.trunc(base / 2820) * 1029983 +
    365 * (julian - 1) +
    div(682 * julian - 110, 2816);
  return jdn + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

export function getFirstDayOfJalaliMonth(jy: number, jm: number): number {
  const jdn = jalaliToJulianDay(jy, jm, 1);
  const gregDay = Math.floor(jdn + 1.5) % 7;
  return (gregDay + 1) % 7; // 0 = شنبه, 6 = جمعه
}

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

export function parsePersianDate(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const cleaned = toEnglishDigits(dateStr).trim();
  const parts = cleaned.split(/[\/\-\.]/).map((p) => parseInt(p, 10));
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    let year = parts[0];
    // Support two-digit year like 03 -> 1403
    if (year < 100) year += 1400;
    const month = Math.min(12, Math.max(1, parts[1]));
    const day = Math.min(31, Math.max(1, parts[2]));
    return { year, month, day };
  }
  return null;
}

export function formatPersianDate(year: number, month: number, day: number, inFarsiDigits = true): string {
  const m = month < 10 ? `0${month}` : `${month}`;
  const d = day < 10 ? `0${day}` : `${day}`;
  const formatted = `${year}/${m}/${d}`;
  return inFarsiDigits ? toPersianDigits(formatted) : formatted;
}

export const PersianDatePicker: React.FC<PersianDatePickerProps> = ({
  value,
  onChange,
  label = 'مهلت بررسی و اعلام نظر',
  placeholder = 'انتخاب تاریخ شمسی...',
  required = false,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = getTodayJalali();
  const parsedValue = parsePersianDate(value);

  const [viewYear, setViewYear] = useState<number>(parsedValue?.year || today.year);
  const [viewMonth, setViewMonth] = useState<number>(parsedValue?.month || today.month);

  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formatted = formatPersianDate(viewYear, viewMonth, day, true);
    onChange(formatted);
    setIsOpen(false);
  };

  const handleQuickSelect = (offsetMonths: number, offsetDays = 0) => {
    let y = today.year;
    let m = today.month + offsetMonths;
    let d = today.day + offsetDays;

    while (m > 12) {
      m -= 12;
      y += 1;
    }
    while (m < 1) {
      m += 12;
      y -= 1;
    }

    const maxDays = getJalaliMonthLength(y, m);
    if (d > maxDays) d = maxDays;

    const formatted = formatPersianDate(y, m, d, true);
    onChange(formatted);
    setViewYear(y);
    setViewMonth(m);
    setIsOpen(false);
  };

  const monthLength = getJalaliMonthLength(viewYear, viewMonth);
  const firstDayWeekday = getFirstDayOfJalaliMonth(viewYear, viewMonth); // 0 = شنبه

  // Generate Year options (1395 to 1415)
  const years = Array.from({ length: 21 }, (_, i) => 1395 + i);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Input Box Trigger */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between rounded-xl bg-white border px-3.5 py-2 text-xs sm:text-sm text-slate-900 transition cursor-pointer shadow-2xs ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
      >
        <div className="flex items-center gap-2 truncate">
          <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className={`font-semibold ${value ? 'text-slate-900' : 'text-slate-400'}`}>
            {value ? toPersianDigits(value) : placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 transition cursor-pointer"
              title="پاک کردن تاریخ"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
            شمسی
          </span>
        </div>
      </div>

      {/* Persian Calendar Popup */}
      {isOpen && (
        <div className="absolute z-50 mt-2 right-0 w-72 sm:w-80 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header Controls: Month & Year Selectors & Prev/Next */}
          <div className="flex items-center justify-between gap-1 mb-3 pb-2.5 border-b border-slate-100">
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
              title="ماه بعد"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {/* Month Selector */}
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>

              {/* Year Selector */}
              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="px-2 py-1 rounded-lg text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer font-mono"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {toPersianDigits(y)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition cursor-pointer"
              title="ماه قبل"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Labels (شنبه تا جمعه) */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[11px] font-bold text-slate-500">
            {PERSIAN_WEEKDAYS.map((wd, i) => (
              <div
                key={i}
                className={`py-1 rounded-lg ${
                  wd.isWeekend ? 'text-rose-600 bg-rose-50/50' : 'text-slate-600'
                }`}
                title={wd.name}
              >
                {wd.label}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Leading empty offsets */}
            {Array.from({ length: firstDayWeekday }, (_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}

            {/* Day buttons */}
            {Array.from({ length: monthLength }, (_, i) => {
              const dayNum = i + 1;
              const isSelected =
                parsedValue &&
                parsedValue.year === viewYear &&
                parsedValue.month === viewMonth &&
                parsedValue.day === dayNum;

              const isToday =
                today.year === viewYear &&
                today.month === viewMonth &&
                today.day === dayNum;

              const weekdayIndex = (firstDayWeekday + i) % 7;
              const isFriday = weekdayIndex === 6;

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={`h-8 w-full rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer relative ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/40'
                      : isToday
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-300 font-extrabold hover:bg-indigo-100'
                      : isFriday
                      ? 'text-rose-600 hover:bg-rose-50'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
                  }`}
                >
                  <span>{toPersianDigits(dayNum)}</span>
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-indigo-600" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Presets & Clear Toolbar */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleQuickSelect(0, 0)}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-bold transition cursor-pointer"
              >
                امروز
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect(1, 0)}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-bold transition cursor-pointer"
              >
                ۱ ماه بعد
              </button>
              <button
                type="button"
                onClick={() => handleQuickSelect(3, 0)}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-bold transition cursor-pointer"
              >
                ۳ ماه بعد
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="px-2 py-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
            >
              پاک کردن
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
