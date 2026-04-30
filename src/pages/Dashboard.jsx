import React from 'react';
import { useTickets } from '../store/TicketContext';
import { 
  Ticket, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Users
} from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, color, trend }) => (
  <div className="glass p-6 rounded-2xl flex flex-col gap-4 relative overflow-hidden group">
    <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${color}-500/5 rounded-full blur-2xl group-hover:bg-${color}-500/10 transition-all duration-500`}></div>
    <div className="flex items-center justify-between">
      <div className={`p-3 rounded-xl bg-${color}-500/10 text-${color}-500`}>
        <Icon size={24} />
      </div>
      {trend && (
        <span className="text-green-500 text-xs font-bold bg-green-500/10 px-2 py-1 rounded-lg flex items-center gap-1">
          <TrendingUp size={12} /> {trend}
        </span>
      )}
    </div>
    <div>
      <p className="text-muted-foreground text-sm font-medium">{title}</p>
      <h3 className="text-3xl font-bold mt-1 text-foreground">{value}</h3>
    </div>
  </div>
);

const Dashboard = () => {
  const { tickets } = useTickets();

  const stats = [
    { title: 'Всего заявок', value: tickets.length, icon: Ticket, color: 'blue', trend: '+12%' },
    { title: 'Выполнено', value: tickets.filter(t => t.status === 'completed').length, icon: CheckCircle2, color: 'green', trend: '+5%' },
    { title: 'В работе', value: tickets.filter(t => t.status === 'in-progress').length, icon: Clock, color: 'yellow' },
    { title: 'Ожидают', value: tickets.filter(t => t.status === 'new').length, icon: AlertCircle, color: 'red' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-foreground">Дашборд</h1>
        <p className="text-muted-foreground">Обзор операционной деятельности Herotrack</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <StatCard key={i} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock className="text-primary" size={20} />
              Последние заявки
            </h2>
            <button className="text-sm text-primary font-medium hover:underline">Все заявки</button>
          </div>
          <div className="space-y-4">
            {tickets.slice(0, 5).map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                    #{ticket.id?.slice(-3)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{ticket.title || 'Без названия'}</p>
                    <p className="text-xs text-muted-foreground">{ticket.description?.slice(0, 50)}...</p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                  ${ticket.status === 'completed' ? 'bg-green-500/10 text-green-500' : 
                    ticket.status === 'in-progress' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'}
                `}>
                  {ticket.status}
                </div>
              </div>
            ))}
            {tickets.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">Нет активных заявок</div>
            )}
          </div>
        </div>

        <div className="glass p-6 rounded-2xl">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Users className="text-primary" size={20} />
            Активность команды
          </h2>
          <div className="space-y-6">
             {[1, 2, 3].map(i => (
               <div key={i} className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center">
                   <Users size={16} className="text-muted-foreground" />
                 </div>
                 <div className="flex-1">
                   <p className="text-sm font-medium">Пользователь {i}</p>
                   <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                     <div className="h-full bg-primary rounded-full" style={{ width: `${80 - i * 15}%` }}></div>
                   </div>
                 </div>
                 <span className="text-xs font-bold text-muted-foreground">{8 - i} ч.</span>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
