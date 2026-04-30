import React, { useState } from 'react';
import { useTickets } from '../store/TicketContext';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal,
  ChevronRight,
  MessageSquare,
  Paperclip
} from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const TicketsPage = () => {
  const { tickets, addTicket } = useTickets();
  const [filter, setFilter] = useState('all');

  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'in-progress': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'completed': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'paused': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'new': return 'Новая';
      case 'in-progress': return 'В работе';
      case 'completed': return 'Завершена';
      case 'paused': return 'На паузе';
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-foreground">Заявки</h1>
          <p className="text-muted-foreground">Управление всеми задачами и запросами</p>
        </div>
        <button 
          onClick={() => addTicket({ title: 'Новая задача', description: 'Описание...' })}
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} />
          Создать заявку
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 glass p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          {['all', 'new', 'in-progress', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                ${filter === f 
                  ? 'bg-primary text-white shadow-md' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
              `}
            >
              {f === 'all' ? 'Все' : getStatusText(f)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text" 
              placeholder="Поиск по ID или названию..." 
              className="bg-muted/50 border border-border rounded-xl py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-primary/50 w-64 transition-all"
            />
          </div>
          <button className="p-2 hover:bg-muted border border-border rounded-xl text-muted-foreground transition-all">
            <Filter size={18} />
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden border border-border">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider font-bold">
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Заявка</th>
              <th className="px-6 py-4">Статус</th>
              <th className="px-6 py-4">Приоритет</th>
              <th className="px-6 py-4">Обновлено</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-muted/20 transition-all cursor-pointer group">
                <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                  #{ticket.id?.slice(-6).toUpperCase()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                      {ticket.title || 'Заявка без названия'}
                    </span>
                    <div className="flex items-center gap-3 mt-1">
                       <span className="text-xs text-muted-foreground flex items-center gap-1">
                         <MessageSquare size={12} /> {ticket.comments?.length || 0}
                       </span>
                       {ticket.comments?.some(c => c.attachment) && (
                         <span className="text-xs text-muted-foreground flex items-center gap-1">
                           <Paperclip size={12} />
                         </span>
                       )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${getStatusColor(ticket.status)}`}>
                    {getStatusText(ticket.status)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`flex items-center gap-1.5 text-xs font-bold ${ticket.priority === 'high' ? 'text-red-400' : 'text-blue-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${ticket.priority === 'high' ? 'bg-red-400' : 'bg-blue-400'}`}></div>
                    {ticket.priority === 'high' ? 'Высокий' : 'Обычный'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {ticket.createdAt ? format(ticket.createdAt.toDate(), 'd MMM, HH:mm', { locale: ru }) : 'Недавно'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground transition-all">
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-muted-foreground italic">
                  Список заявок пуст
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TicketsPage;
