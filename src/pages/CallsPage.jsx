import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCall } from '../store/CallContext';
import { Video, Play, Plus, Activity, SignalHigh, BarChart3, ShieldCheck } from 'lucide-react';

const CallsPage = () => {
  const { isInCall, joinCall } = useCall();
  const navigate = useNavigate();

  if (isInCall) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px' }}>
          <div style={{ width: 80, height: 80, background: 'var(--accent-green-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid var(--accent-green-border)' }}>
             <div style={{ width: 20, height: 20, background: 'var(--accent-green)', borderRadius: '50%', animate: 'pulse 2s infinite' }}></div>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 12 }}>ВЫ В СОЗВОНЕ</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 400, margin: '0 auto 32px' }}>
             Вы можете переходить по любым вкладкам (Заявки, График), созвон останется активным в плавающем окне справа.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
            <button 
              onClick={() => navigate('/tickets')}
              style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px var(--accent-blue-shadow)' }}
            >
              ПЕРЕЙТИ К ЗАЯВКАМ
            </button>
          </div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 0' }}>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h3 style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Выберите зал</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {['Зал переговоров', 'HR Отдел'].map((n, i) => (
                <button key={i} onClick={() => joinCall(n)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 28, padding: 32, textAlign: 'left', cursor: 'pointer', transition: 'all 0.3s', boxShadow: 'var(--shadow-card)' }}>
                   <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent-blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '1px solid var(--accent-blue-border)' }}><Play size={22} color="var(--accent-blue)" /></div>
                   <div style={{ fontWeight: 900, color: 'var(--text-primary)', fontSize: 17 }}>{n}</div>
                </button>
              ))}
              <button onClick={() => { const name = prompt('Название (Latin):'); if (name) joinCall(name); }} style={{ background: 'var(--bg-hover)', border: '1px dashed var(--accent-blue)', borderRadius: 28, padding: 32, textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                 <Plus size={24} color="var(--accent-blue)" />
                 <div style={{ fontWeight: 800, color: 'var(--accent-blue)', fontSize: 13 }}>Своя комната</div>
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 32, padding: 32, border: '1px solid var(--border)', alignSelf: 'start', boxShadow: 'var(--shadow-card)' }}>
             <h3 style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>Преимущества</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  { i: SignalHigh, t: 'Многозадачность', d: 'Обсуждайте заявки, не выходя из связи' },
                  { i: BarChart3, t: 'Шейринг экрана', d: 'Показывайте коллегам свой монитор' },
                  { i: ShieldCheck, t: 'HD Видео', d: 'Чистая картинка 1080p' }
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 14, borderBottom: idx < 2 ? '1px solid var(--border)' : 'none', paddingBottom: idx < 2 ? 16 : 0 }}>
                    <item.i size={18} color="var(--accent-blue)" />
                    <div>
                       <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{item.t}</div>
                       <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.d}</div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
      </div>
    </div>
  );
};

export default CallsPage;
