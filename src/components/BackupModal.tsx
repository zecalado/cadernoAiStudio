import React, { useState } from 'react';
import { apiRequest } from '../api/client';
import { ShieldCheck, Download, Upload, CheckCircle2, AlertCircle, HardDrive, FileJson } from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BackupModal({ isOpen, onClose }: BackupModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExportBackup = async () => {
    try {
      setDownloading(true);
      setError(null);
      const data = await apiRequest('/backup/export');
      
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Backup_CadernoLetivo_AEGP_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao exportar cópia de segurança.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Cópia de Segurança dos Dados</h3>
              <p className="text-xs text-slate-500">Caderno Letivo • AEGP</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Exporte uma cópia completa de todos os seus dados pedagógicos: turmas, alunos, avaliações,
            rubricas, acomodações DL 54, ocorrências de aula, assiduidade e sumários.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
            <FileJson className="w-8 h-8 text-indigo-600 shrink-0" />
            <div className="text-xs">
              <div className="font-bold text-slate-800">Formato Standard (.json)</div>
              <div className="text-slate-500 text-[11px]">Compatível com importação e salvaguarda permanente</div>
            </div>
          </div>

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Cópia de segurança descarregada com sucesso para o seu computador.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-400 font-mono">
            Plataforma AEGP • José Calado
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={downloading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? 'A exportar...' : 'Descarregar Cópia (.json)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
