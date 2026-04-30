import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, ChevronLeft, AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { CHECK_ITEMS, SHIFTS_DATA } from '../data/checklistData';
import { toast } from 'sonner';

const ChecklistDetail = () => {
  const { shiftId, cardId } = useParams();
  const navigate = useNavigate();
  const { addTicket } = useTickets(); // Assuming addTicket exists in context
  
  const shift = SHIFTS_DATA.find(s => s.id === shiftId);
  const cardData = CHECK_ITEMS[cardId];
  
  const [checkedItems, setCheckedItems] = useState(() => {
    const saved = localStorage.getItem(`checklist-${shiftId}-${cardId}`);
    return saved ? JSON.parse(saved) : {};
  });
  
  const [issue, setIssue] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);

  useEffect(() => {
    localStorage.setItem(`checklist-${shiftId}-${cardId}`, JSON.stringify(checkedItems));
  }, [checkedItems, shiftId, cardId]);

  if (!shift || !cardData) {
    return <div className="p-10 text-white/40">Загрузка или ошибка...</div>;
  }

  const handleToggle = (index) => {
    setCheckedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleComplete = async () => {
    if (issue.trim() && !cardData.noTicket) {
      // Create a ticket if there's an issue and it's not cleaning
      const newTicket = {
        title: `Проблема: ${cardData.title} (${shift.time})`,
        subtitle: issue,
        club: '4YOU', // For demo
        priority: 'medium',
        status: 'new',
        createdAt: 'Только что'
      };
      
      // If addTicket is available in context, use it. Otherwise just toast.
      if (addTicket) {
        await addTicket(newTicket);
        toast.success('Заявка создана автоматически');
      } else {
        toast.info('Issue reported (TicketContext integration pending)');
      }
    }
    
    toast.success('Проверка завершена');
    navigate('/checklists');
  };

  const allChecked = cardData.items.every((_, i) => checkedItems[i]);

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items List */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          {cardData.items.map((item, i) => (
            <label 
              key={i}
              className={`flex items-center gap-4 p-5 rounded-2xl cursor-pointer transition-all border ${
                checkedItems[i] ? 'bg-green-500/5 border-green-500/20' : 'bg-[#111113] border-white/5 hover:border-white/10'
              }`}
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${
                checkedItems[i] ? 'bg-green-500 border-green-500 text-white' : 'border-white/10 text-transparent'
              }`}>
                <ShieldCheck size={14} strokeWidth={3} />
              </div>
              <input 
                type="checkbox" 
                className="hidden"
                checked={!!checkedItems[i]}
                onChange={() => handleToggle(i)}
              />
              <span className={`text-sm font-medium transition-colors ${checkedItems[i] ? 'text-white/90' : 'text-white/60'}`}>
                {item}
              </span>
            </label>
          ))}
        </div>

        {/* Sidebar Actions */}
        <div className="flex flex-col gap-6">
          <div className="bg-[#111113] border border-white/5 rounded-3xl p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
              <AlertCircle size={14} className="text-orange-500" />
              Возникла проблема?
            </h3>
            
            {!cardData.noTicket ? (
              <div className="flex flex-col gap-4">
                <textarea 
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  placeholder="Опишите проблему, если она есть. После подтверждения будет создана заявка."
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white/80 focus:border-purple-500/50 outline-none transition-all resize-none"
                />
                <p className="text-[10px] text-white/30 italic">
                  * По этой категории проблем автоматически создается тикет в техподдержку.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 text-[11px] text-blue-400/80 leading-relaxed">
                Для чек-листа по уборке автоматическое создание заявок отключено. Обо всех серьезных проблемах сообщайте напрямую администратору.
              </div>
            )}
          </div>

          <button 
            onClick={handleComplete}
            disabled={!allChecked}
            className={`w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              allChecked 
                ? 'bg-[#7B3DFF] text-white shadow-xl shadow-purple-500/20 hover:-translate-y-0.5' 
                : 'bg-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 size={18} />
            Завершить проверку
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistDetail;
