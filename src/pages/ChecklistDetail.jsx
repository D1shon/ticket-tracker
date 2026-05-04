import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ChevronLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { useChecklist } from '../store/ChecklistContext';
import { CHECK_ITEMS, SHIFTS_DATA } from '../data/checklistData';
import { format, startOfToday } from 'date-fns';
import { toast } from 'sonner';

const ChecklistDetail = () => {
  const { shiftId, cardId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addTicket } = useTickets();
  const { checklistData, updateCheckState } = useChecklist();
  
  const dateKey = searchParams.get('date') || format(startOfToday(), 'yyyy-MM-dd');
  const docId = `${dateKey}_${shiftId}_${cardId}`;
  
  const shift = SHIFTS_DATA.find(s => s.id === shiftId);
  const cardData = CHECK_ITEMS[cardId];
  
  const [itemStates, setItemStates] = useState({});
  const [itemIssues, setItemIssues] = useState({});

  // Load from context on mount or docId change
  useEffect(() => {
    const data = checklistData[docId];
    if (data) {
      setItemStates(data.states || {});
      setItemIssues(data.issues || {});
    }
  }, [docId, checklistData]);

  // Save to Firestore when states/issues change
  const handleStateChange = (index, state) => {
    const newStates = { ...itemStates, [index]: state };
    setItemStates(newStates);
    updateCheckState(dateKey, shiftId, cardId, newStates, itemIssues);
  };

  const handleIssueChange = (index, text) => {
    const newIssues = { ...itemIssues, [index]: text };
    setItemIssues(newIssues);
    updateCheckState(dateKey, shiftId, cardId, itemStates, newIssues);
  };

  const handleComplete = async () => {
    // Create tickets for each item that has an issue
    const issueIndices = Object.keys(itemStates).filter(idx => itemStates[idx] === 'issue');
    
    if (!cardData.noTicket) {
      for (const idx of issueIndices) {
        const problemDescription = itemIssues[idx];
        const itemTitle = cardData.items[idx];
        
        if (problemDescription?.trim()) {
          const newTicket = {
            title: `${itemTitle} (${shift.time})`,
            subtitle: problemDescription,
            club: '4YOU', // Default for demo
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
    navigate('/checklists');
  };

  const allAnswered = cardData.items.every((_, i) => itemStates[i] !== undefined && itemStates[i] !== null);

  return (
    <div className="animate-fade min-h-full" style={{ color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate('/checklists')}
          className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{cardData.title}</h1>
          <p className="text-xs text-white/40 font-medium uppercase tracking-wider mt-0.5">
            {shift.time} {shift.name} · Клуб 4YOU
          </p>
        </div>
      </div>

      <div className="max-w-4xl">
        {/* Items List */}
        <div className="flex flex-col gap-6 mb-12">
          {cardData.items.map((item, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div 
                className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${
                  itemStates[i] === 'ok' ? 'bg-green-500/5 border-green-500/20' : 
                  itemStates[i] === 'issue' ? 'bg-red-500/5 border-red-500/20' : 
                  'bg-[#111113] border-white/5'
                }`}
              >
                <span className={`text-sm font-bold ${itemStates[i] ? 'text-white/90' : 'text-white/60'}`}>
                  {item}
                </span>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleStateChange(i, 'ok')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${
                      itemStates[i] === 'ok' 
                        ? 'bg-green-500 border-green-500 text-white' 
                        : 'bg-white/5 border-white/5 text-white/40 hover:text-white/60'
                    }`}
                  >
                    Все хорошо
                  </button>
                  <button 
                    onClick={() => handleStateChange(i, 'issue')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${
                      itemStates[i] === 'issue' 
                        ? 'bg-red-500 border-red-500 text-white' 
                        : 'bg-white/5 border-white/5 text-white/40 hover:text-white/60'
                    }`}
                  >
                    Проблема
                  </button>
                </div>
              </div>

              {/* Conditional Issue Input */}
              {itemStates[i] === 'issue' && (
                <div className="animate-slide-down px-2">
                  <textarea 
                    value={itemIssues[i] || ''}
                    onChange={(e) => handleIssueChange(i, e.target.value)}
                    placeholder="Опишите проблему подробно..."
                    className="w-full bg-[#151518] border border-red-500/20 rounded-2xl p-4 text-sm text-white/80 focus:border-red-500/40 outline-none transition-all resize-none h-24"
                  />
                  {!cardData.noTicket && (
                    <p className="text-[9px] text-red-400/50 mt-2 ml-2 uppercase font-bold tracking-widest flex items-center gap-1">
                      <AlertCircle size={10} /> Автоматически создаст заявку
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-4 pt-8 border-t border-white/5">
          <button 
            onClick={() => navigate('/checklists')}
            className="px-8 py-4 rounded-2xl bg-white/5 text-white/60 text-sm font-bold hover:bg-white/10 transition-all"
          >
            Отмена
          </button>
          <button 
            onClick={handleComplete}
            disabled={!allAnswered}
            className={`flex-1 py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              allAnswered 
                ? 'bg-[#7B3DFF] text-white shadow-xl shadow-purple-500/20 hover:-translate-y-0.5' 
                : 'bg-white/5 text-white/20 cursor-not-allowed'
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
