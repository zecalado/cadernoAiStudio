import React, { useState, useEffect } from 'react';
import { apiRequest, setStoredToken } from '../api/client';
import { Teacher } from '../types';
import { GraduationCap, ShieldCheck, KeyRound, User, School, Mail, Lock, ArrowRight, Sparkles, UserPlus, CheckCircle2, Ticket } from 'lucide-react';

interface AuthViewProps {
  isInitialized: boolean;
  onLoginSuccess: (teacher: Teacher) => void;
}

export function AuthView({ isInitialized, onLoginSuccess }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'setup' | 'recover' | 'invite'>(isInitialized ? 'login' : 'setup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteInfo, setInviteInfo] = useState<{ inviterName: string; inviterSchool?: string; recipientEmail?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check URL query parameters on mount for ?convite= or ?invite=
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get('convite') || params.get('invite') || params.get('code');
      if (codeFromUrl) {
        const clean = codeFromUrl.trim().toUpperCase();
        setInviteCode(clean);
        setMode('invite');
        validateInviteCode(clean);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  const validateInviteCode = async (codeToTest: string) => {
    if (!codeToTest || codeToTest.length < 4) return;
    setError(null);
    try {
      const data = await apiRequest<{
        valid: boolean;
        code: string;
        inviterName: string;
        inviterSchool?: string;
        recipientEmail?: string;
      }>(`/invitations/validate?code=${encodeURIComponent(codeToTest)}`);
      
      if (data.valid) {
        setInviteInfo({
          inviterName: data.inviterName,
          inviterSchool: data.inviterSchool,
          recipientEmail: data.recipientEmail,
        });
        if (data.recipientEmail && !email) {
          setEmail(data.recipientEmail);
        }
        if (data.inviterSchool && !school) {
          setSchool(data.inviterSchool);
        }
      }
    } catch (err: any) {
      setInviteInfo(null);
      setError(err.message || 'Convite inválido ou expirado.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; teacher: Teacher }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(data.token, true);
      onLoginSuccess(data.teacher);
    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar sessão');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; teacher: Teacher }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, school }),
      });
      setStoredToken(data.token, true);
      onLoginSuccess(data.teacher);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; teacher: Teacher }>('/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, school }),
      });
      setStoredToken(data.token, true);
      onLoginSuccess(data.teacher);
    } catch (err: any) {
      setError(err.message || 'Erro ao configurar conta');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterWithInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; teacher: Teacher }>('/auth/register-invite', {
        method: 'POST',
        body: JSON.stringify({
          code: inviteCode.trim().toUpperCase(),
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          school: school ? school.trim() : undefined,
        }),
      });
      setStoredToken(data.token, true);
      onLoginSuccess(data.teacher);
    } catch (err: any) {
      setError(err.message || 'Erro ao ativar convite');
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await apiRequest('/auth/recover-password', {
        method: 'POST',
        body: JSON.stringify({ email, newPassword: password }),
      });
      setSuccessMsg('Palavra-passe redefinida com sucesso. Pode agora iniciar sessão com a nova chave.');
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Erro ao recuperar palavra-passe');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemo = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; teacher: Teacher }>('/demo/seed', {
        method: 'POST',
      });
      setStoredToken(data.token, true);
      onLoginSuccess(data.teacher);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados de demonstração');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center px-4 py-2.5 rounded-2xl bg-white shadow-xl shadow-black/20 mb-4">
            <img
              src="/assets/aistudio/AEGP_c929fad4.png"
              alt="AEGP - Agrupamento de Escolas Gabriel Pereira"
              className="h-12 w-auto object-contain"
            />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Caderno Letivo</h1>
          <p className="text-indigo-200 mt-1.5 text-sm font-medium">
            Agrupamento de Escolas Gabriel Pereira — Évora
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-100 text-slate-800">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm font-medium">
              {successMsg}
            </div>
          )}

          {/* SETUP INITIAL ACCOUNT */}
          {mode === 'setup' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">Configuração Inicial do Professor</h2>
              </div>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Bem-vindo ao seu Caderno Letivo. Para salvaguardar a privacidade dos seus alunos e registos pedagógicos, crie a sua conta de acesso privado. Não existe registo público de terceiros.
              </p>

              <form onSubmit={handleSetup} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Professor *</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Prof. Manuel Silva"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Escola ou Instituição (opcional)</label>
                  <div className="relative">
                    <School className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="Ex: Agrupamento de Escolas Gabriel Pereira - Évora"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Pessoal ou Institucional *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="professor@escola.pt"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Palavra-passe de Acesso *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm rounded-lg shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? 'A configurar...' : 'Concluir Configuração e Entrar'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* Tab switcher for Login / Register */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex border-b border-slate-200 mb-6 -mx-6 sm:-mx-8 px-6 sm:px-8">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMsg(null);
                  setMode('login');
                }}
                className={`pb-3 text-sm font-semibold transition-colors cursor-pointer mr-6 border-b-2 flex items-center gap-2 ${
                  mode === 'login'
                    ? 'text-indigo-600 border-indigo-600 font-bold'
                    : 'text-slate-400 border-transparent hover:text-slate-600 font-medium'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                Iniciar Sessão
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMsg(null);
                  setMode('register');
                }}
                className={`pb-3 text-sm font-semibold transition-colors cursor-pointer border-b-2 flex items-center gap-2 ${
                  mode === 'register'
                    ? 'text-indigo-600 border-indigo-600 font-bold'
                    : 'text-slate-400 border-transparent hover:text-slate-600 font-medium'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Criar Conta
              </button>
            </div>
          )}

          {/* LOGIN */}
          {mode === 'login' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                  <KeyRound className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">Acesso do Professor</h2>
              </div>
              <p className="text-xs text-slate-500 mb-5">
                Introduza as suas credenciais para aceder ao caderno letivo privado.
              </p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="professor@escola.pt"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Palavra-passe</label>
                    <button
                      type="button"
                      onClick={() => setMode('recover')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                    >
                      Esqueceu-se da palavra-passe?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm rounded-lg shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? 'A validar...' : 'Iniciar Sessão'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col gap-2.5 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode('register');
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer py-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Novo no Caderno Letivo? Criar conta de professor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('invite');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer py-1"
                >
                  <Ticket className="w-3.5 h-3.5" />
                  Recebeu um código de convite de um colega? Ativar conta
                </button>
              </div>
            </div>
          )}

          {/* REGISTER DIRECTLY */}
          {mode === 'register' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                  <UserPlus className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">Criar Conta de Professor</h2>
              </div>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Registe-se para aceder ao seu Caderno Letivo pessoal. Todos os seus dados, turmas e avaliações são estritamente privados e não são partilhados com outros utilizadores.
              </p>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Professor *</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Prof. José Santos"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Escola ou Instituição (opcional)</label>
                  <div className="relative">
                    <School className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="Ex: Escola Secundária Camões"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Pessoal ou Institucional *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="professor@escola.pt"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Definir Palavra-passe *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Mínimo de 6 caracteres para segurança da conta.</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium text-sm rounded-lg shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? 'A criar conta...' : 'Criar Conta e Iniciar'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                >
                  Já tem uma conta configurada? <strong>Iniciar Sessão</strong>
                </button>
              </div>
            </div>
          )}

          {/* REGISTER WITH INVITATION */}
          {mode === 'invite' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                  <UserPlus className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">Registo por Convite</h2>
              </div>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Ative a sua conta de professor através do código de convite individual. O seu caderno letivo é 100% privado e isolado.
              </p>

              {inviteInfo && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Convite Válido!</span>
                    <p className="text-emerald-700 mt-0.5">
                      Emitido por <strong>{inviteInfo.inviterName}</strong>
                      {inviteInfo.inviterSchool ? ` (${inviteInfo.inviterSchool})` : ''}.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleRegisterWithInvite} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código de Convite *</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Ticket className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        onBlur={() => validateInviteCode(inviteCode)}
                        placeholder="Ex: CL-A1B2C3D4"
                        className="w-full pl-9 pr-3 py-2 text-sm uppercase tracking-wider font-mono font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => validateInviteCode(inviteCode)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Verificar
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">O Seu Nome de Professor *</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Prof.ª Teresa Santos"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Escola ou Instituição (opcional)</label>
                  <div className="relative">
                    <School className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="Ex: Escola Secundária Camões"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">O Seu Email *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="prof.teresa@escola.pt"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Definir Palavra-passe *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode('login');
                    }}
                    className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg cursor-pointer"
                  >
                    Voltar ao Login
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium text-xs rounded-lg shadow cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {loading ? 'A registar...' : 'Ativar e Entrar'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* RECOVER */}
          {mode === 'recover' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="p-1 rounded-md bg-amber-100 text-amber-700">
                  <KeyRound className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">Recuperação de Acesso</h2>
              </div>
              <p className="text-xs text-slate-500 mb-5">
                Defina uma nova palavra-passe para a sua conta de professor.
              </p>

              <form onSubmit={handleRecover} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email da Conta</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="professor@escola.pt"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nova Palavra-passe</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg cursor-pointer"
                  >
                    Voltar ao Início
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg shadow cursor-pointer"
                  >
                    {loading ? 'A gravar...' : 'Gravar Nova Senha'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quick Demo Option for instant testing */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span>Para experimentação imediata</span>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-mono font-medium">Demonstração</span>
            </div>
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={loading}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Carregar Dados Reais de Exemplo (8.º A e 11.º TGPSI)
            </button>
          </div>
        </div>

        {/* Author / Developer attribution & Security */}
        <div className="text-center text-xs mt-6 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/80 text-slate-300 text-xs shadow-md">
            <span>Desenvolvimento da Plataforma:</span>
            <strong className="text-white font-bold">José Calado</strong>
          </div>
          <p className="text-slate-400 text-[11px]">
            Privacidade e segurança: os dados residem na base de dados relacional e não são partilhados publicamente.
          </p>
        </div>
      </div>
    </div>
  );
}
