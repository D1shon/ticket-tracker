import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ChevronLeft, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { useChecklist } from '../store/ChecklistContext';
import { CHECK_ITEMS, SHIFTS_DATA } from '../data/checklistData';
import { format, startOfToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';

const ChecklistDetail = () => {
  const { shiftId, cardId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addTicket } = useTickets();
  const { checklistData, updateCheckState } = useChecklist();
  
  const dateKey = searchParams.get('date') || format(startOfToday(), 'yyyy-MM-dd');
  const club = searchParams.get('club') || '4YOU';
  const docId = `${dateKey}_${club}_${shiftId}_${cardId}`;
  
  const shift = SHIFTS_DATA.find(s => s.id === shiftId);
  const cardData = CHECK_ITEMS[cardId];
  
  const [itemStates, setItemStates] = useState({});
  const [itemIssues, setItemIssues] = useState({});
  const [itemTimestamps, setItemTimestamps] = useState({});

  // Load from context on mount or docId change
  useEffect(() => {
    const data = checklistData[docId];
    if (data) {
      setItemStates(data.states || {});
      setItemIssues(data.issues || {});
      setItemTimestamps(data.timestamps || {});
    }
  }, [docId, checklistData]);

  const handleStateChange = (index, state) => {
    const now = new Date();
    const timeStr = format(now, 'HH:mm', { locale: ru });

    const newStates = { ...itemStates, [index]: state };
    const newTimestamps = { ...itemTimestamps, [index]: timeStr };

    setItemStates(newStates);
    setItemTimestamps(newTimestamps);
    updateCheckState(dateKey, shiftId, cardId, club, newStates, itemIssues, newTimestamps);
  };

  const handleIssueChange = (index, text) => {
    const newIssues = { ...itemIssues, [index]: text };
    setItemIssues(newIssues);
    updateCheckState(dateKey, shiftId, cardId, club, itemStates, newIssues, itemTimestamps);
  };

  const handleComplete = async () => {
    const issueIndices = Object.keys(itemStates).filter(idx => itemStates[idx] === 'issue');
    
    if (!cardData.noTicket) {
      for (const idx of issueIndices) {
        const problemDescription = itemIssues[idx];
        const itemTitle = cardData.items[idx];
        
        if (problemDescription?.trim()) {
          const newTicket = {
            title: `${itemTitle} (${shift.time})`,
            subtitle: problemDescription,
            club: club,
            priority: 'high',
            status: 'new',
            createdAt: 'Только что'
          };
          
          if (addTicket) {
            await addTicket(newTicket);
          }
        }
      }
      if (issueIndices.length > 0) {
        toast.success(`${issueIndices.length} заявок создано автоматически`);
      }
    }
    
    toast.success('Проверка завершена');
    navigate(`/checklists?club=${club}&date=${dateKey}`);
  };

  const allAnswered = cardData.items.every((_, i) => itemStates[i] !== undefined && itemStates[i] !== null);

  const getFormattedDate = () => {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return format(new Date(y, m - 1, d), 'dd.MM.yyyy');
    }
    return dateKey;
  };
  const formattedDate = getFormattedDate();

  return (
    <div className="animate-fade min-h-full" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate(`/checklists?club=${club}&date=${dateKey}`)}
          className="w-10 h-10 rounded-full bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)]/80 flex items-center justify-center text-[var(--text-secondary)] transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{cardData.title}</h1>
          <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider mt-0.5">
            {shift.time} {shift.name} · Клуб <span style={{ color: 'var(--accent-purple)', fontWeight: 900 }}>{club}</span> · Дата: <span className="text-[var(--text-secondary)] font-bold">{formattedDate}</span>
          </p>
        </div>
      </div>

      <div className="max-w-4xl">
        {/* Items List */}
        <div className="flex flex-col gap-6 mb-12">
          {cardData.items.map((item, i) => {
            const state = itemStates[i];
            const ts = itemTimestamps[i];

            return (
              <div key={i} className="flex flex-col gap-3">
                <div 
                  className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${
                    state === 'ok' ? 'bg-green-500/5 border-green-500/20' : 
                    state === 'issue' ? 'bg-red-500/5 border-red-500/20' : 
                    'bg-[var(--bg-card)] border-[var(--border)]'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className={`text-sm font-bold ${state ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                      {item}
                    </span>
                    {/* Timestamp badge */}
                    {ts && (
                      <span className={`flex items-center gap-1 text-[10px] font-bold ${
                        state === 'ok' ? 'text-green-400/70' : 'text-red-400/70'
                      }`}>
                        <Clock size={10} />
                        {state === 'ok' ? 'Все хорошо' : 'Проблема'} — отмечено в {ts}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button 
                      onClick={() => handleStateChange(i, 'ok')}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${
                        state === 'ok' 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'bg-[var(--bg-hover)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      Все хорошо
                    </button>
                    <button 
                      onClick={() => handleStateChange(i, 'issue')}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${
                        state === 'issue' 
                          ? 'bg-red-500 border-red-500 text-white' 
                          : 'bg-[var(--bg-hover)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      Проблема
                    </button>
                  </div>
                </div>

                {/* Conditional Issue Input */}
                {state === 'issue' && (
                  <div className="animate-slide-down px-2">
                    <textarea 
                      value={itemIssues[i] || ''}
                      onChange={(e) => handleIssueChange(i, e.target.value)}
                      placeholder="Опишите проблему подробно..."
                      className="w-full bg-[var(--bg-card)] border border-red-500/20 rounded-2xl p-4 text-sm text-[var(--text-primary)] focus:border-red-500/40 outline-none transition-all resize-none h-24"
                    />
                    {!cardData.noTicket && (
                      <p className="text-[9px] text-red-400/50 mt-2 ml-2 uppercase font-bold tracking-widest flex items-center gap-1">
                        <AlertCircle size={10} /> Автоматически создаст заявку
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-4 pt-8 border-t border-[var(--border)]">
          <button 
            onClick={() => navigate(`/checklists?club=${club}&date=${dateKey}`)}
            className="px-8 py-4 rounded-2xl bg-[var(--bg-hover)] text-[var(--text-secondary)] text-sm font-bold hover:bg-[var(--bg-hover)]/80 transition-all"
          >
            Отмена
          </button>
          <button 
            onClick={handleComplete}
            disabled={!allAnswered}
            className={`flex-1 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              allAnswered 
                ? 'bg-[var(--accent-purple)] text-white shadow-xl shadow-purple-500/20 hover:-translate-y-0.5' 
                : 'bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed'
            }`}
          >
            <CheckCircle2 size={18} />
            Подтвердить и завершить
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistDetail;
