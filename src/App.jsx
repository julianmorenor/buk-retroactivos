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
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Business Logic ---

const FACTORS = {
  HED: 1.25,
  HEN: 1.75,
  HEFD: 2.0,
  HEFN: 2.5,
  RN: 0.35
};

const calculateRetroactive = (data) => {
  const oldSalary = parseFloat(data.SUELDO_ANTERIOR) || 0;
  const newSalary = parseFloat(data.SUELDO_NUEVO) || 0;
  const months = parseFloat(data.MESES_RETRO) || 0;

  const baseDiff = newSalary - oldSalary;

  // 1. Retroactivo Sueldo
  const retroSalary = baseDiff * months;

  const results = [];

  if (retroSalary > 0) {
    results.push({
      CEDULA: data.CEDULA,
      NOMBRE: data.NOMBRE,
      CONCEPTO: 'Retroactivo sueldo',
      VALOR_A_PAGAR: Math.round(retroSalary)
    });
  }

  // 2. Retroactivo Horas Extras
  // Formula: ((Diferencia_Base / 240) * Factor * Cantidad)
  const hourlyDiff = baseDiff / 240;

  const otTypes = [
    { key: 'HED_CANTIDAD', factor: FACTORS.HED, label: 'Retroactivo HE diurna' },
    { key: 'HEN_CANTIDAD', factor: FACTORS.HEN, label: 'Retroactivo HE nocturna' },
    { key: 'HEFD_CANTIDAD', factor: FACTORS.HEFD, label: 'Retroactivo HE festiva diurna' },
    { key: 'HEFN_CANTIDAD', factor: FACTORS.HEFN, label: 'Retroactivo HE festiva nocturna' },
    { key: 'RN_CANTIDAD', factor: FACTORS.RN, label: 'Retroactivo recargo nocturno' }
  ];

  otTypes.forEach(type => {
    const qty = parseFloat(data[type.key]) || 0;
    if (qty > 0) {
      const value = hourlyDiff * type.factor * qty;
      if (value > 0) {
        results.push({
          CEDULA: data.CEDULA,
          NOMBRE: data.NOMBRE,
          CONCEPTO: type.label,
          VALOR_A_PAGAR: Math.round(value)
        });
      }
    }
  });

  return results;
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

const Input = ({ label, ...props }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-brand-dark">{label}</label>
    <input
      className="w-full px-3 py-2 rounded-lg border border-brand-muted/50 focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none transition-all text-brand-dark"
      {...props}
    />
  </div>
);

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

// --- Main Application ---

function App() {
  const [activeTab, setActiveTab] = useState('individual');
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Individual Form State
  const [formData, setFormData] = useState({

    SUELDO_ANTERIOR: '',
    SUELDO_NUEVO: '',
    MESES_RETRO: '',
    HED_CANTIDAD: '',
    HEN_CANTIDAD: '',
    HEFD_CANTIDAD: '',
    HEFN_CANTIDAD: '',
    RN_CANTIDAD: ''
  });

  const handleIndividualCalculate = (e) => {
    e.preventDefault();
    try {
      const calculated = calculateRetroactive({
        ...formData,
        CEDULA: '-',
        NOMBRE: 'Simulación'
      });
      setResults(calculated);
      setError(null);
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

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length > 10000) {
        throw new Error("El archivo excede el límite de 10.000 filas.");
      }

      const allResults = jsonData.flatMap(row => calculateRetroactive(row));
      setResults(allResults);
    } catch (err) {
      setError(err.message || "Error al procesar el archivo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "CEDULA", "NOMBRE", "SUELDO_ANTERIOR", "SUELDO_NUEVO",
      "MESES_RETRO", "HED_CANTIDAD", "HEN_CANTIDAD",
      "HEFD_CANTIDAD", "HEFN_CANTIDAD", "RN_CANTIDAD"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_retroactivos.xlsx");
  };

  const downloadReport = () => {
    if (results.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(results);
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
            <Card className="overflow-hidden h-full">
              <div className="flex border-b border-slate-200">
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

              <div className="p-5">
                {activeTab === 'individual' ? (
                  <form onSubmit={handleIndividualCalculate} className="space-y-4">

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Sueldo anterior"
                        type="number"
                        value={formData.SUELDO_ANTERIOR}
                        onChange={e => setFormData({ ...formData, SUELDO_ANTERIOR: e.target.value })}
                        required
                      />
                      <Input
                        label="Sueldo nuevo"
                        type="number"
                        value={formData.SUELDO_NUEVO}
                        onChange={e => setFormData({ ...formData, SUELDO_NUEVO: e.target.value })}
                        required
                      />
                    </div>
                    <Input
                      label="Meses retroactivo"
                      type="number"
                      step="0.1"
                      value={formData.MESES_RETRO}
                      onChange={e => setFormData({ ...formData, MESES_RETRO: e.target.value })}
                      required
                    />

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
                          label="Fest. Diurna (2.0)"
                          type="number"
                          placeholder="0"
                          value={formData.HEFD_CANTIDAD}
                          onChange={e => setFormData({ ...formData, HEFD_CANTIDAD: e.target.value })}
                        />
                        <Input
                          label="Fest. Noct. (2.5)"
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
