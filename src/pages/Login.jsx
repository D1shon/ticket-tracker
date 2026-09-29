import React, { useState } from 'react';
import { useTickets } from '../store/TicketContext';
import { Mail, LogIn, AlertCircle, Lock, Eye, EyeOff, KeyRound, GraduationCap } from 'lucide-react';

const Login = () => {
  const { checkEmail, createPassword, loginWithPassword, loginAsGuest, resetPassword } = useTickets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Гостевой вход стажёра: по кнопке раскрывается форма имени
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestFirst, setGuestFirst] = useState('');
  const [guestLast, setGuestLast] = useState('');

  const submitGuest = async () => {
    setError(''); setInfo('');
    const first = guestFirst.trim();
    const last = guestLast.trim();
    if (!first || !last) { setError('Введите имя и фамилию — так наставник увидит вас в чекине.'); return; }
    setLoading(true);
    try { await loginAsGuest(`${first} ${last}`); }
    catch (e) { setError('Не удалось войти как гость: ' + (e?.message || e)); setLoading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    // Короткий логин (напр. admin-4you) → дописываем домен, чтобы был валидный email
    let mail = email.trim().toLowerCase();
    if (mail && !mail.includes('@')) mail += '@hj.fit';
    if (!mail || !password) return;
    setLoading(true);
    try {
      const { allowed, hasPassword } = await checkEmail(mail);
      if (!allowed) {
        setError('Этот email не зарегистрирован в системе. Обратитесь к администратору.');
        setLoading(false);
        return;
      }
      // Есть пароль — входим; нет — этот пароль становится вашим (первый вход)
      if (hasPassword) {
        await loginWithPassword(mail, password);
      } else {
        await createPassword(mail, password);
      }
      // успех → onAuthStateChanged перебросит на главную
    } catch (err) {
      // Подстраховка при «отвалившемся» флаге: аккаунт есть → пробуем войти, и наоборот
      if (err.code === 'ACCOUNT_EXISTS') {
        try { await loginWithPassword(mail, password); return; }
        catch (e2) { setError(e2.message || 'Неверный пароль'); }
      } else if (err.code === 'NO_ACCOUNT') {
        try { await createPassword(mail, password); return; }
        catch (e2) { setError(e2.message || 'Не удалось создать пароль'); }
      } else {
        setError(err.message || 'Не удалось войти');
      }
      setLoading(false);
    }
  };

  const doReset = async () => {
    setError(''); setInfo('');
    let mail = email.trim().toLowerCase();
    if (mail && !mail.includes('@')) mail += '@hj.fit';
    if (!mail) { setError('Сначала введите email.'); return; }
    try {
      await resetPassword(mail);
      setInfo('Письмо для сброса пароля отправлено. Проверьте почту (и «Спам»).');
    } catch (err) {
      setError(err.message || 'Не удалось отправить письмо');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] -left-[25%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-[25%] -right-[25%] w-[50%] h-[50%] bg-blue-500/5 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md glass p-8 rounded-2xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center font-bold text-3xl text-white mb-4 shadow-xl shadow-primary/20">HJ</div>
          <h1 className="text-2xl font-bold text-foreground">С возвращением!</h1>
          <p className="text-muted-foreground mt-1 text-center">Войдите в систему управления заявками HJTRACK</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5 ml-1">Email или логин</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@hj.fit или admin-4you"
                className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                required autoFocus autoComplete="username" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5 ml-1">Пароль</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ваш пароль"
                className="w-full bg-muted/50 border border-border rounded-xl py-2.5 pl-10 pr-11 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                required autoComplete="current-password" />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 ml-1">
              Входите впервые? Просто <span className="text-primary font-medium">придумайте пароль</span> — он закрепится за вашим аккаунтом.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          {info && (
            <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-400">{info}</p>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <><LogIn size={20} /> Войти</>}
          </button>

          <div className="text-right">
            <button type="button" onClick={doReset} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              <KeyRound size={14} /> Забыли пароль?
            </button>
          </div>
        </form>

        {/* Гостевой вход для стажёров — без email и пароля, но с именем */}
        <div className="mt-6 pt-6 border-t border-border">
          {!guestOpen ? (
            <button
              type="button"
              onClick={() => { setError(''); setGuestOpen(true); }}
              disabled={loading}
              className="w-full border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <GraduationCap size={20} /> Я стажёр — войти без пароля
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <GraduationCap size={18} className="text-primary" /> Представьтесь — и начнём обучение
              </p>
              <div className="flex gap-3">
                <input
                  type="text" value={guestFirst} onChange={(e) => setGuestFirst(e.target.value)}
                  placeholder="Имя" autoFocus autoComplete="given-name"
                  onKeyDown={(e) => e.key === 'Enter' && submitGuest()}
                  className="w-1/2 bg-muted/50 border border-border rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                />
                <input
                  type="text" value={guestLast} onChange={(e) => setGuestLast(e.target.value)}
                  placeholder="Фамилия" autoComplete="family-name"
                  onKeyDown={(e) => e.key === 'Enter' && submitGuest()}
                  className="w-1/2 bg-muted/50 border border-border rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                />
              </div>
              <button
                type="button" onClick={submitGuest} disabled={loading}
                className="w-full border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div> : <><LogIn size={18} /> Войти как стажёр</>}
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Гостевой доступ: Академия, Гайдбук, Регламент травм и Чекин
          </p>
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-muted-foreground">
            Нет доступа? <span className="text-primary font-medium">Обратитесь к администратору</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
