import React, { useState, useRef, useCallback } from 'react';
import {
  Calculator,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  Info,
  CalendarDays,
  CalendarRange
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CustomCalendar } from './components/CustomCalendar';

// Utility for Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Business Logic ---

const FACTORS = {
  HED: 1.25,
  HEN: 1.75,
  HEFD: 2.05,
  HEFN: 2.55,
  RN: 0.35
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/**
 * Returns an array of closed periods between two dates based on payroll type.
 * Supports YYYY-MM-DD and DD/MM/YYYY input formats.
 * @param {string} startStr 
 * @param {string} endStr 
 * @param {'mensual'|'quincenal'} type 
 * @returns {Array<{start: string, end: string}>} Array of period objects
 */
const getPeriods = (startStr, endStr, type) => {
  if (!startStr || !endStr) return [];

  // Helper to parse date strings
  const parseDate = (str) => {
    if (typeof str !== 'string') return [0, 0, 0];

    // Try YYYY-MM-DD
    if (str.includes('-')) {
      const parts = str.split('-').map(Number);
      if (parts[0] > 1000) return parts; // YYYY-MM-DD
      return [parts[2], parts[1], parts[0]]; // DD-MM-YYYY fallback
    }
    // Try DD/MM/YYYY
    if (str.includes('/')) {
      const parts = str.split('/').map(Number);
      return [parts[2], parts[1], parts[0]]; // DD/MM/YYYY
    }
    return [0, 0, 0];
  };

  const [sY, sM, sD] = parseDate(startStr);
  const [eY, eM, eD] = parseDate(endStr);

  // Validate parsing
  if (!sY || !eY || isNaN(sY) || isNaN(eY)) return [];

  // Normalize months to 0-indexed
  const startMonthIndex = sM - 1;
  const endMonthIndex = eM - 1;

  const periods = [];
  let currentY = sY;
  let currentM = startMonthIndex;

  // Iterate through each month involved
  while (currentY < eY || (currentY === eY && currentM <= endMonthIndex)) {
    const daysInMonth = getDaysInMonth(currentY, currentM);

    // Format helper (Internal format is always YYYY-MM-DD)
    const fmt = (d) => `${currentY}-${String(currentM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    if (type === 'mensual') {
      // Rule: Must cover FULL month (1st to Last Day)
      let isFull = true;
      if (currentY === sY && currentM === startMonthIndex && sD > 1) isFull = false;
      if (currentY === eY && currentM === endMonthIndex && eD < daysInMonth) isFull = false;

      if (isFull) {
        periods.push({
          start: fmt(1),
          end: fmt(daysInMonth)
        });
      }

    } else { // quincenal
      // Q1: 1st to 15th
      let q1Valid = true;
      if (currentY === sY && currentM === startMonthIndex && sD > 1) q1Valid = false;
      if (currentY === eY && currentM === endMonthIndex && eD < 15) q1Valid = false;

      if (q1Valid) {
        periods.push({
          start: fmt(1),
          end: fmt(15)
        });
      }

      // Q2: 16th to Last Day
      let q2Valid = true;
      if (currentY === sY && currentM === startMonthIndex && sD > 16) q2Valid = false;
      if (currentY === eY && currentM === endMonthIndex && eD < daysInMonth) q2Valid = false;

      if (q2Valid) {
        periods.push({
          start: fmt(16),
          end: fmt(daysInMonth)
        });
      }
    }

    // Advance
    currentM++;
    if (currentM > 11) {
      currentM = 0;
      currentY++;
    }
  }

  return periods;
};

const calculateRetroactive = (data, payrollType) => {
  const oldSalary = parseFloat(data.SUELDO_ANTERIOR) || 0;
  const newSalary = parseFloat(data.SUELDO_NUEVO) || 0;

  // Get list of valid periods
  const periods = getPeriods(data.FECHA_INICIO, data.FECHA_FIN, payrollType);

  if (periods.length === 0) {
    return { details: [], summaries: [] };
  }

  const baseDiff = newSalary - oldSalary;

  // Calculate Retro Salary per period
  // Mensual: Diff * 1
  // Quincenal: Diff * 0.5
  const salaryFactor = payrollType === 'mensual' ? 1 : 0.5;
  const retroSalaryPerPeriod = baseDiff * salaryFactor;

  // Calculate OT Retro (Total for the whole range)
  const hourlyDiff = baseDiff / 240;
  const otMapping = [
    {
      key: 'HED_CANTIDAD',
      factor: FACTORS.HED,
      label: 'Retroactivo HE diurna',
      reportValKey: 'Devengos Prestacionales - Hora Extra Diurna Ordinaria (1.25)',
      reportQtyKey: 'Comprobante - Hora Extra Diurna Ordinaria (1.25)'
    },
    {
      key: 'HEN_CANTIDAD',
      factor: FACTORS.HEN,
      label: 'Retroactivo HE nocturna',
      reportValKey: 'Devengos Prestacionales - Hora Extra Nocturna (1.75)',
      reportQtyKey: 'Comprobante - Hora Extra Nocturna (1.75)'
    },
    {
      key: 'HEFD_CANTIDAD',
      factor: FACTORS.HEFD,
      label: 'Retroactivo HE festiva diurna',
      reportValKey: 'Devengos Prestacionales - Hora Extra Diurna Dominical Y Festivos (2.05)',
      reportQtyKey: 'Comprobante - Hora Extra Diurna Dominical y Festivos (2.05)'
    },
    {
      key: 'HEFN_CANTIDAD',
      factor: FACTORS.HEFN,
      label: 'Retroactivo HE festiva nocturna',
      reportValKey: 'Devengos Prestacionales - Hora Extra Nocturna Dominical Y Festivos (2.55)',
      reportQtyKey: 'Comprobante - Hora Extra Nocturna Dominical Y Festivos (2.55)'
    }
  ];

  const details = [];
  const summaries = [];

  // Iterate over periods to generate rows
  periods.forEach((period, index) => {
    // Format start date for report: DD/MM/YYYY
    const [pY, pM, pD] = period.start.split('-');
    const formattedStartDate = `${pD}/${pM}/${pY}`;

    const summary = {
      'Comprobante - Período': formattedStartDate,
      'Colaborador - Nombre Completo': data.NOMBRE,
      'Colaborador - Número de Documento': data.CEDULA,
      'Colaborador - Código de Ficha': data.CODIGO_FICHA_COLABORADOR || '',
      'Devengos Prestacionales - Salario': 0,
      'Devengos Prestacionales - Hora Extra Diurna Dominical Y Festivos (2.05)': 0,
      'Comprobante - Hora Extra Diurna Dominical y Festivos (2.05)': 0,
      'Devengos Prestacionales - Hora Extra Diurna Ordinaria (1.25)': 0,
      'Comprobante - Hora Extra Diurna Ordinaria (1.25)': 0,
      'Devengos Prestacionales - Hora Extra Nocturna (1.75)': 0,
      'Comprobante - Hora Extra Nocturna (1.75)': 0,
      'Devengos Prestacionales - Hora Extra Nocturna Dominical Y Festivos (2.55)': 0,
      'Comprobante - Hora Extra Nocturna Dominical Y Festivos (2.55)': 0,
    };

    // Add Salary Retro
    if (retroSalaryPerPeriod > 0) {
      const val = Math.round(retroSalaryPerPeriod);
      summary['Devengos Prestacionales - Salario'] = val;

      details.push({
        CEDULA: data.CEDULA,
        NOMBRE: data.NOMBRE,
        CONCEPTO: 'Retroactivo sueldo',
        DETALLE: `Periodo ${formattedStartDate}`,
        VALOR_A_PAGAR: val
      });
    }

    // Add OT Retro ONLY to the FIRST period
    if (index === 0) {
      otMapping.forEach(type => {
        const qty = parseFloat(data[type.key]) || 0;
        if (qty > 0) {
          const value = hourlyDiff * type.factor * qty;
          if (value > 0) {
            const roundedVal = Math.round(value);

            if (type.reportValKey) {
              summary[type.reportValKey] = roundedVal;
              summary[type.reportQtyKey] = qty;
            }

            details.push({
              CEDULA: data.CEDULA,
              NOMBRE: data.NOMBRE,
              CONCEPTO: type.label,
              DETALLE: `${qty} horas`,
              VALOR_A_PAGAR: roundedVal
            });
          }
        }
      });
    }

    summaries.push(summary);
  });

  return { details, summaries };
};

// --- UI Components ---

const Card = ({ children, className }) => (
  <div className={cn("bg-white rounded-xl border border-slate-200 shadow-sm", className)}>
    {children}
  </div>
);

const Button = ({ children, variant = 'primary', className, ...props }) => {
  const variants = {
    primary: "bg-brand-primary text-white hover:bg-brand-secondary shadow-sm",
    secondary: "bg-white text-brand-dark border border-brand-muted hover:bg-brand-light/20",
    outline: "bg-transparent text-brand-primary border border-brand-muted hover:bg-brand-light/20",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
  };

  return (
    <button
      className={cn(
        "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ label, error, ...props }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-brand-dark block">
      {label}
    </label>
    <input
      className={cn(
        "w-full px-3 py-2 rounded-lg border outline-none transition-all text-brand-dark",
        error
          ? "border-red-300 focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-red-50/30"
          : "border-brand-muted/50 focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
      )}
      {...props}
    />
    {error && <span className="text-xs text-red-500 font-normal block">Requerido</span>}
  </div>
);

const DateInput = ({ label, error, ...props }) => {
  const inputRef = useRef(null);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-brand-dark block">
        {label}
      </label>
      <div
        className="relative group cursor-pointer"
        onClick={() => inputRef.current?.showPicker()}
      >
        <input
          ref={inputRef}
          type="date"
          className={cn(
            "w-full px-3 py-2 rounded-lg border outline-none transition-all text-brand-dark cursor-pointer appearance-none",
            error
              ? "border-red-300 focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-red-50/30"
              : "border-brand-muted/50 focus:ring-2 focus:ring-brand-primary focus:border-brand-primary bg-white"
          )}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-red-500 font-normal block">Requerido</span>}
    </div>
  );
};

const Badge = ({ children, variant = 'default' }) => {
  const variants = {
    default: "bg-brand-light/50 text-brand-dark",
    success: "bg-green-50 text-green-700 border border-green-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200"
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", variants[variant])}>
      {children}
    </span>
  );
};

const Toggle = ({ options, value, onChange }) => {
  return (
    <div className="flex bg-slate-100 p-1 rounded-lg">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all",
            value === option.value
              ? "bg-white text-brand-primary shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

// --- Main Application ---

function App() {
  const [activeTab, setActiveTab] = useState('individual');
  const [payrollType, setPayrollType] = useState('mensual'); // 'mensual' | 'quincenal'

  const [results, setResults] = useState([]); // Array of detail objects for UI
  const [reportData, setReportData] = useState([]); // Array of summary objects for Excel

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Individual Form State
  const [formData, setFormData] = useState({
    SUELDO_ANTERIOR: '',
    SUELDO_NUEVO: '',
    FECHA_INICIO: '',
    FECHA_FIN: '',
    HED_CANTIDAD: '',
    HEN_CANTIDAD: '',
    HEFD_CANTIDAD: '',
    HEFN_CANTIDAD: '',
    RN_CANTIDAD: ''
  });

  const handleIndividualCalculate = (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!formData.SUELDO_ANTERIOR) newErrors.SUELDO_ANTERIOR = true;
    if (!formData.SUELDO_NUEVO) newErrors.SUELDO_NUEVO = true;
    if (!formData.FECHA_INICIO) newErrors.FECHA_INICIO = true;
    if (!formData.FECHA_FIN) newErrors.FECHA_FIN = true;

    setFieldErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      // Don't set global error, just return. The fields will show red.
      return;
    }

    try {
      const { details, summaries } = calculateRetroactive({
        ...formData,
        CEDULA: '-',
        NOMBRE: 'Simulación',
        CODIGO_FICHA_COLABORADOR: '-'
      }, payrollType);

      if (details.length === 0) {
        setError("No se generaron resultados. Verifique que las fechas cubran periodos cerrados completos.");
        setResults([]);
        setReportData([]);
      } else {
        setResults(details);
        setReportData(summaries);
        setError(null);
      }
    } catch (err) {
      setError("Error en el cálculo. Verifique los datos.");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setResults([]);
    setReportData([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, dateNF: 'yyyy-mm-dd' });

      if (jsonData.length === 0) {
        throw new Error("El archivo parece estar vacío o no se pudieron leer datos.");
      }

      if (jsonData.length > 10000) {
        throw new Error("El archivo excede el límite de 10.000 filas.");
      }

      // Validate headers
      const firstRow = jsonData[0];
      const requiredKeys = ['FECHA_INICIO', 'FECHA_FIN', 'SUELDO_ANTERIOR', 'SUELDO_NUEVO'];
      const missingKeys = requiredKeys.filter(key => !(key in firstRow));

      if (missingKeys.length > 0) {
        throw new Error(`Faltan columnas requeridas en el archivo: ${missingKeys.join(', ')}. Por favor use la plantilla.`);
      }

      const allDetails = [];
      const allSummaries = [];

      jsonData.forEach(row => {
        const { details, summaries } = calculateRetroactive(row, payrollType);
        allDetails.push(...details);
        allSummaries.push(...summaries);
      });

      if (allDetails.length === 0) {
        setError("El archivo se procesó pero no se generaron resultados. Verifique que las fechas tengan el formato correcto (AAAA-MM-DD o DD/MM/AAAA) y cubran periodos válidos.");
      } else {
        setResults(allDetails);
        setReportData(allSummaries);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "Error al procesar el archivo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "CEDULA", "NOMBRE", "CODIGO_FICHA_COLABORADOR", "SUELDO_ANTERIOR", "SUELDO_NUEVO",
      "FECHA_INICIO", "FECHA_FIN", "HED_CANTIDAD", "HEN_CANTIDAD",
      "HEFD_CANTIDAD", "HEFN_CANTIDAD"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_retroactivos.xlsx");
  };

  const downloadReport = () => {
    if (reportData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, "reporte_retroactivos.xlsx");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <header className="bg-brand-primary rounded-2xl p-6 text-white shadow-lg shadow-brand-primary/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <img src="/logo_buk_blanco.png" alt="Buk Logo" className="h-8 w-auto" />
              <div className="h-8 w-px bg-white/20"></div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  Calculadora de retroactivos
                </h1>
                <p className="text-brand-light text-sm font-light opacity-90">
                  Gestión de reintegros salariales y horas extras
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium bg-brand-dark/30 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
              <span className="text-brand-light">Procesamiento local seguro</span>
            </div>
          </div>
        </header>

        {/* Beta Warning Banner */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <p className="font-semibold mb-0.5">Versión Beta (No Oficial)</p>
            <p className="opacity-90">
              Esta es una versión beta. Buk como compañía no respalda ni se hace responsable por esta herramienta hasta que sea lanzada como una versión oficial.
            </p>
          </div>
        </div>

        {/* Privacy Banner */}
        <div className="bg-brand-light/30 border border-brand-muted/30 rounded-xl p-4 flex gap-3 items-start">
          <Info className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
          <div className="text-sm text-brand-dark">
            <p className="font-semibold mb-0.5">Privacidad garantizada</p>
            <p className="opacity-90">
              El procesamiento de nómina se realiza 100% en su navegador. Sus datos nunca salen de su computador,
              no se envían a ningún servidor externo ni se guardan en la nube.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Input */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="h-full">
              <div className="flex border-b border-slate-200 rounded-t-xl overflow-hidden">
                <button
                  onClick={() => setActiveTab('individual')}
                  className={cn(
                    "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                    activeTab === 'individual'
                      ? "border-blue-600 text-blue-600 bg-blue-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  )}
                >
                  Individual
                </button>
                <button
                  onClick={() => setActiveTab('mass')}
                  className={cn(
                    "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
                    activeTab === 'mass'
                      ? "border-blue-600 text-blue-600 bg-blue-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  )}
                >
                  Carga masiva
                </button>
              </div>

              <div className="p-5 space-y-5">
                {activeTab === 'individual' ? (
                  <form onSubmit={handleIndividualCalculate} className="space-y-4">

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Sueldo anterior"
                        type="number"
                        placeholder="0"
                        value={formData.SUELDO_ANTERIOR}
                        onChange={e => setFormData({ ...formData, SUELDO_ANTERIOR: e.target.value })}
                        error={fieldErrors.SUELDO_ANTERIOR}
                      />
                      <Input
                        label="Sueldo nuevo"
                        type="number"
                        placeholder="0"
                        value={formData.SUELDO_NUEVO}
                        onChange={e => setFormData({ ...formData, SUELDO_NUEVO: e.target.value })}
                        error={fieldErrors.SUELDO_NUEVO}
                      />
                    </div>

                    {/* Payroll Type Toggle */}
                    <div className="space-y-2 pt-2">
                      <label className="text-sm font-medium text-brand-dark">Tipo de nómina</label>
                      <Toggle
                        options={[
                          { label: 'Mensual', value: 'mensual' },
                          { label: 'Quincenal', value: 'quincenal' }
                        ]}
                        value={payrollType}
                        onChange={setPayrollType}
                      />
                      <p className="text-xs text-slate-500">
                        {payrollType === 'mensual'
                          ? 'Se calcularán meses completos (1 al 30/31).'
                          : 'Se calcularán periodos cerrados (1-15 y 16-Fin).'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <CustomCalendar
                        label="Desde"
                        value={formData.FECHA_INICIO ? new Date(formData.FECHA_INICIO + 'T00:00:00') : null}
                        onChange={(date) => {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          setFormData({ ...formData, FECHA_INICIO: `${year}-${month}-${day}` });
                        }}
                        error={fieldErrors.FECHA_INICIO}
                        payrollType={payrollType}
                        dateType="start"
                      />
                      <CustomCalendar
                        label="Hasta"
                        value={formData.FECHA_FIN ? new Date(formData.FECHA_FIN + 'T00:00:00') : null}
                        onChange={(date) => {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          setFormData({ ...formData, FECHA_FIN: `${year}-${month}-${day}` });
                        }}
                        error={fieldErrors.FECHA_FIN}
                        payrollType={payrollType}
                        dateType="end"
                        align="right"
                      />
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Horas Extras (Cantidad)</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Diurna (1.25)"
                          type="number"
                          placeholder="0"
                          value={formData.HED_CANTIDAD}
                          onChange={e => setFormData({ ...formData, HED_CANTIDAD: e.target.value })}
                        />
                        <Input
                          label="Nocturna (1.75)"
                          type="number"
                          placeholder="0"
                          value={formData.HEN_CANTIDAD}
                          onChange={e => setFormData({ ...formData, HEN_CANTIDAD: e.target.value })}
                        />
                        <Input
                          label="Fest. Diurna (2.05)"
                          type="number"
                          placeholder="0"
                          value={formData.HEFD_CANTIDAD}
                          onChange={e => setFormData({ ...formData, HEFD_CANTIDAD: e.target.value })}
                        />
                        <Input
                          label="Fest. Noct. (2.55)"
                          type="number"
                          placeholder="0"
                          value={formData.HEFN_CANTIDAD}
                          onChange={e => setFormData({ ...formData, HEFN_CANTIDAD: e.target.value })}
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full mt-4">
                      Calcular retroactivo
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-6 text-center">
                    {/* Mass Upload Section */}
                    <div className="space-y-4">
                      <div className="text-left space-y-2">
                        <label className="text-sm font-medium text-brand-dark">Tipo de Nómina para el cálculo</label>
                        <Toggle
                          options={[
                            { label: 'Mensual', value: 'mensual' },
                            { label: 'Quincenal', value: 'quincenal' }
                          ]}
                          value={payrollType}
                          onChange={setPayrollType}
                        />
                      </div>

                      <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-slate-50 transition-colors relative">
                        <input
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          disabled={isProcessing}
                        />
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 bg-brand-light text-brand-primary rounded-full flex items-center justify-center">
                            <Upload className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">Arrastra tu archivo aquí</p>
                            <p className="text-sm text-slate-500">o haz clic para seleccionar</p>
                          </div>
                          <p className="text-xs text-slate-400">Máximo 10.000 filas</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button variant="outline" onClick={downloadTemplate} className="w-full text-sm">
                          <FileSpreadsheet className="w-4 h-4" />
                          Descargar Plantilla
                        </Button>
                        <p className="text-xs text-slate-400 px-4">
                          Usa la plantilla para asegurar que las columnas sean correctas.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-2 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-200">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <Card className="h-full flex flex-col min-h-[500px]">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-brand-dark">Resultados</h2>
                  {results.length > 0 && (
                    <Badge variant="success">{results.length} registros</Badge>
                  )}
                </div>
                {results.length > 0 && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setResults([])} className="text-red-600 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={downloadReport}>
                      <Download className="w-4 h-4" />
                      Exportar reporte
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-auto p-0">
                {results.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Calculator className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-lg font-medium text-slate-500">Sin resultados aún</p>
                    <p className="text-sm">Realiza un cálculo individual o carga un archivo para ver los detalles.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="px-4 py-3">Cédula</th>
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Concepto</th>
                        <th className="px-4 py-3">Detalle</th>
                        <th className="px-4 py-3 text-right">Valor a pagar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-600">{row.CEDULA}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{row.NOMBRE}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <Badge variant="default">{row.CONCEPTO}</Badge>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {row.DETALLE}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-brand-primary">
                            $ {row.VALOR_A_PAGAR.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {results.length > 10 && (
                <div className="p-3 border-t border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                  Mostrando los primeros 10 resultados de {results.length}. Descarga el reporte para ver todo.
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
