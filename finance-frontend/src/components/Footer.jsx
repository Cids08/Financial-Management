export default function Footer() {
  return (
    <footer className="border-t border-border px-4 sm:px-6 lg:px-8 py-5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted text-center sm:text-left">
        <p>{'\u00a9'} {new Date().getFullYear()} <span className="font-medium text-ink">Alibaton Construction Inc.</span> <span className="hidden md:inline">/ Financial Management System</span></p>
        <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />Developed by BSIT Researchers</p>
      </div>
    </footer>
  )
}
