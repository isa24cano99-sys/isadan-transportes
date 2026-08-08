'use client'

import { useState } from 'react'
import { parseXlsx, mapDian, type DianRow } from '@/lib/dian-xlsx'
import { importarDianAction, type ImportResult } from './actions'
import { Upload, CheckCircle, FileSpreadsheet, RefreshCw } from 'lucide-react'

// ── Main component ─────────────────────────────────────────────────────────────

export default function ImportarClient() {
  const [dianRows,    setDianRows]    = useState<DianRow[]>([])
  const [dianFileName,setDianFileName]= useState('')
  const [loadingDian, setLoadingDian] = useState(false)
  const [dianResult,  setDianResult]  = useState<ImportResult | null>(null)

  const handleDianFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setDianFileName(file.name); setDianResult(null)
    setDianRows((await parseXlsx(file)).map(mapDian))
  }

  const importDian = async () => {
    setLoadingDian(true)
    setDianResult(await importarDianAction(dianRows))
    setLoadingDian(false)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Importar facturas DIAN</h1>
        <p className="text-sm text-[#64748B] mt-0.5">
          Carga el reporte .xlsx de facturas electrónicas recibidas en la bandeja DIAN.
        </p>
      </div>

      <div className="max-w-xl">
        <UploadCard
          label="DIAN" title="Reporte DIAN"
          description="Archivo .xlsx con facturas electrónicas recibidas en la bandeja DIAN."
          fileName={dianFileName} rowCount={dianRows.length}
          loading={loadingDian} result={dianResult}
          onFile={handleDianFile} onImport={importDian}
          buttonLabel="Importar facturas DIAN"
        />
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function UploadCard({
  label, title, description, fileName, rowCount,
  loading, result, onFile, onImport, buttonLabel,
}: {
  label: string; title: string; description: string; fileName: string; rowCount: number
  loading: boolean; result: ImportResult | null
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onImport: () => void; buttonLabel: string
}) {
  const done = result?.ok === true
  const res  = result as { ok: true; inserted: number; duplicates: number } | null
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-white bg-[#2563EB] px-2 py-0.5 rounded">{label}</span>
        <h2 className="font-semibold text-[#0F172A] text-sm">{title}</h2>
      </div>
      <p className="text-xs text-[#94A3B8] mb-4">{description}</p>

      <label className="block mb-3 cursor-pointer">
        <div className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${
          fileName ? 'border-[#2563EB] bg-blue-50/40' : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
        }`}>
          <FileSpreadsheet size={22} className={`mx-auto mb-1.5 ${fileName ? 'text-[#2563EB]' : 'text-[#CBD5E1]'}`} />
          <p className="text-xs text-[#64748B] truncate max-w-[200px] mx-auto">
            {fileName || 'Haz clic o arrastra el archivo'}
          </p>
          {rowCount > 0 && (
            <p className="text-xs font-semibold text-[#2563EB] mt-1">{rowCount} filas leídas</p>
          )}
        </div>
        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
      </label>

      {result?.ok === false && (
        <p className="text-xs text-red-600 mb-2 bg-red-50 rounded-lg px-3 py-2">Error: {result.error}</p>
      )}
      {done && res && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">
          <CheckCircle size={13} />
          <span>
            {res.inserted} importados
            {res.duplicates > 0 ? ` · ${res.duplicates} duplicados omitidos` : ''}
          </span>
        </div>
      )}

      <button
        onClick={onImport}
        disabled={!rowCount || loading || done}
        className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading
          ? <><RefreshCw size={13} className="animate-spin" /> Importando…</>
          : done
            ? <><CheckCircle size={13} /> Importado</>
            : <><Upload size={13} /> {buttonLabel}</>
        }
      </button>
    </div>
  )
}
