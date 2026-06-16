import NuevaCuentaForm from './form'

export default function NuevaCuentaPage() {
  return (
    <div className="p-6 max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#0F172A]">Nueva cuenta bancaria</h1>
        <p className="text-sm text-[#64748B] mt-0.5">Registra una nueva cuenta bancaria</p>
      </div>
      <NuevaCuentaForm />
    </div>
  )
}
