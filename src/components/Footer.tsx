import React from 'react';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white/95 py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-600 shadow-2xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/assets/aistudio/AEGP_c929fad4.png"
            alt="Logótipo AEGP"
            className="h-8 w-auto object-contain"
          />
          <div className="text-left">
            <p className="font-bold text-slate-900 leading-tight">
              Agrupamento de Escolas Gabriel Pereira — Évora
            </p>
            <p className="text-[11px] text-slate-500">
              Caderno Letivo • Plataforma de Gestão Curricular e Avaliação Pedagógica
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center md:text-right">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50/80 border border-indigo-200/70 text-indigo-950 text-xs font-medium">
            <span>Responsável pelo Desenvolvimento:</span>
            <strong className="font-extrabold text-indigo-700">José Calado</strong>
          </div>
          <span className="text-[11px] text-slate-400">© {new Date().getFullYear()} AEGP</span>
        </div>
      </div>
    </footer>
  );
}
