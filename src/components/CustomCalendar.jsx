import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const DAYS_OF_WEEK = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function CustomCalendar({ value, onChange, isDateValid, label, payrollType, dateType, error, align = 'left', placeholder }) {
    // Use value or today as the initial view
    const initialDate = value ? new Date(value) : new Date();
    const [viewDate, setViewDate] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    const [isOpen, setIsOpen] = useState(false);

    // Toggle calendar visibility
    const toggleCalendar = () => setIsOpen(!isOpen);

    // Navigate months
    const changeMonth = (offset) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
        setViewDate(newDate);
    };

    // Generate days for the current month view
    const days = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        // First day of the month
        const firstDay = new Date(year, month, 1);
        // Last day of the month
        const lastDay = new Date(year, month + 1, 0);

        // Days from previous month to fill the first row
        const daysInPrevMonth = firstDay.getDay(); // 0 (Sunday) - 6 (Saturday)
        const prevMonthDays = [];
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = daysInPrevMonth - 1; i >= 0; i--) {
            prevMonthDays.push({
                date: new Date(year, month - 1, prevMonthLastDay - i),
                isCurrentMonth: false
            });
        }

        // Days of current month
        const currentMonthDays = [];
        for (let i = 1; i <= lastDay.getDate(); i++) {
            currentMonthDays.push({
                date: new Date(year, month, i),
                isCurrentMonth: true
            });
        }

        // Days from next month to fill the grid (6 rows * 7 days = 42)
        const totalDays = prevMonthDays.length + currentMonthDays.length;
        const nextMonthDays = [];
        const daysNeeded = 42 - totalDays;
        for (let i = 1; i <= daysNeeded; i++) {
            nextMonthDays.push({
                date: new Date(year, month + 1, i),
                isCurrentMonth: false
            });
        }

        return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
    }, [viewDate]);

    const handleDayClick = (day) => {
        if (!day.isCurrentMonth) {
            // Optionally switch month? For now, let's just ignore or switch
            const newMonthDate = new Date(day.date.getFullYear(), day.date.getMonth(), 1);
            setViewDate(newMonthDate);
        }

        if (isDateValid && !isDateValid(day.date)) return;

        onChange(day.date);
        setIsOpen(false);
    };

    const formatDate = (date) => {
        if (!date) return '';
        // Format: YYYY-MM-DD for consistency or DD/MM/YYYY for display?
        // Let's use DD/MM/YYYY
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div className="relative">
            <label className="text-sm font-medium text-brand-dark block">
                {label}
            </label>
            <button
                type="button"
                onClick={toggleCalendar}
                className={cn(
                    "w-full px-3 py-2 text-left rounded-lg border outline-none transition-all text-brand-dark cursor-pointer flex justify-between items-center group",
                    error
                        ? "border-red-300 focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-red-50/30"
                        : "border-brand-muted/50 bg-white hover:bg-slate-50 focus:ring-2 focus:ring-brand-primary"
                )}
            >
                <span className={cn(!value && "text-slate-400")}>{value ? formatDate(value) : (placeholder || 'DD/MM/AAAA')}</span>
            </button>
            {error && <span className="text-xs text-red-500 font-normal block mt-1.5">Requerido</span>}

            {isOpen && (
                <div className={cn(
                    "absolute z-50 mt-2 p-4 bg-white rounded-xl shadow-xl border border-slate-200 w-72 animate-in fade-in zoom-in-95 duration-100",
                    align === 'right' ? "right-0" : "left-0"
                )}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={() => changeMonth(-1)}
                            className="p-1 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <span className="font-semibold text-slate-800">
                            {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                        </span>
                        <button
                            type="button"
                            onClick={() => changeMonth(1)}
                            className="p-1 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Weekdays */}
                    <div className="grid grid-cols-7 mb-2 text-center">
                        {DAYS_OF_WEEK.map(day => (
                            <div key={day} className="text-xs font-medium text-slate-400">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days */}
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, idx) => {
                            const checkDate = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate());
                            const isSelected = value && checkDate.getTime() === new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
                            const checkPayrollValidation = (date) => {
                                if (!payrollType || !dateType) return true;

                                const day = date.getDate();
                                const year = date.getFullYear();
                                const month = date.getMonth();
                                const lastDay = new Date(year, month + 1, 0).getDate();

                                if (payrollType === 'mensual') {
                                    if (dateType === 'start') return day === 1;
                                    if (dateType === 'end') return day === lastDay;
                                }

                                if (payrollType === 'quincenal') {
                                    if (dateType === 'start') return day === 1 || day === 16;
                                    if (dateType === 'end') return day === 15 || day === lastDay;
                                }

                                return true;
                            };

                            const isValid = (!isDateValid || isDateValid(day.date)) && checkPayrollValidation(day.date);

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleDayClick(day)}
                                    disabled={!isValid}
                                    className={cn(
                                        "w-8 h-8 rounded-full text-sm flex items-center justify-center transition-all",
                                        !day.isCurrentMonth && "text-slate-300",
                                        day.isCurrentMonth && !isSelected && isValid && "text-slate-700 hover:bg-slate-100",
                                        isSelected && "bg-brand-primary text-white shadow-md shadow-brand-primary/30",
                                        !isValid && "opacity-20 cursor-not-allowed selection:bg-none"
                                    )}
                                >
                                    {day.date.getDate()}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}
