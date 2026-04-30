import React, { useState } from 'react';
import { CheckSquare, ListTodo, Plus, MoreHorizontal, Clock } from 'lucide-react';

const initialChecklists = {
  daily: [
    { id: 1, text: 'Проверить почту и новые заявки', completed: false },
    { id: 2, text: 'Провести утренний брифинг с командой', completed: false },
    { id: 3, text: 'Сформировать отчет за предыдущий день', completed: true },
    { id: 4, text: 'Проверить работоспособность серверов', completed: false },
  ],
  weekly: [
    { id: 5, text: 'Архивировать закрытые заявки', completed: false },
    { id: 6, text: 'Собрать статистику по инцидентам', completed: false },
    { id: 7, text: 'Провести ревью сложных задач', completed: false },
  ],
  general: [
    { id: 8, text: 'Обновить документацию', completed: false },
    { id: 9, text: 'Проверить доступы уволенных сотрудников', completed: false },
  ]
};

const ChecklistPage = () => {
  const [activeTab, setActiveTab] = useState('daily');
  const [checklists, setChecklists] = useState(initialChecklists);
  const [newItemText, setNewItemText] = useState('');

  const toggleItem = (tabKey, id) => {
    setChecklists(prev => ({
      ...prev,
      [tabKey]: prev[tabKey].map(item => 
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    }));
  };

  const addItem = (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    const newItem = {
      id: Date.now(),
      text: newItemText,
      completed: false
    };

    setChecklists(prev => ({
      ...prev,
      [activeTab]: [...prev[activeTab], newItem]
    }));
    setNewItemText('');
  };

  const tabs = [
    { id: 'daily', label: 'Ежедневные', icon: Clock },
    { id: 'weekly', label: 'Еженедельные', icon: ListTodo },
    { id: 'general', label: 'Общие задачи', icon: CheckSquare },
  ];

  const currentItems = checklists[activeTab] || [];
  const completedCount = currentItems.filter(i => i.completed).length;
  const progress = currentItems.length > 0 ? (completedCount / currentItems.length) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-foreground">Чек-листы</h1>
        <p className="text-muted-foreground">Отслеживание регулярных задач и процедур</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-border/50 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-5 py-3 rounded-t-xl transition-all font-medium text-sm
              ${activeTab === tab.id 
                ? 'bg-primary/10 text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }
            `}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
        <div className="lg:col-span-2 space-y-6">
          <div className="glass p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Список задач
              </h2>
              <span className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-lg">
                Выполнено: {completedCount} / {currentItems.length}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-muted rounded-full mb-6 overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            {/* List */}
            <div className="space-y-3">
              {currentItems.map((item) => (
                <div 
                  key={item.id} 
                  className={`
                    flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer group
                    ${item.completed 
                      ? 'bg-primary/5 border-primary/20 text-muted-foreground line-through' 
                      : 'bg-muted/30 border-border/50 hover:border-primary/30 text-foreground'
                    }
                  `}
                  onClick={() => toggleItem(activeTab, item.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`
                      w-6 h-6 rounded flex items-center justify-center transition-all border
                      ${item.completed 
                        ? 'bg-primary border-primary text-white' 
                        : 'border-muted-foreground/30 group-hover:border-primary/50'
                      }
                    `}>
                      {item.completed && <CheckSquare size={14} />}
                    </div>
                    <span className="text-sm font-medium">{item.text}</span>
                  </div>
                  <button className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-muted rounded-lg">
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              ))}
              
              {currentItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Список задач пуст
                </div>
              )}
            </div>

            {/* Add New Item */}
            <form onSubmit={addItem} className="mt-6 flex items-center gap-3">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                placeholder="Добавить новую задачу..."
                className="flex-1 bg-muted/50 border border-border rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
              />
              <button 
                type="submit"
                disabled={!newItemText.trim()}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white p-3 rounded-xl transition-all shadow-lg shadow-primary/20"
              >
                <Plus size={20} />
              </button>
            </form>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl relative overflow-hidden">
             <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
             <h3 className="text-lg font-bold mb-2">Статус дня</h3>
             <p className="text-muted-foreground text-sm mb-4">
               {progress === 100 
                 ? 'Отличная работа! Все задачи выполнены.' 
                 : 'Не забудьте отметить все задачи до конца смены.'}
             </p>
             <div className="text-4xl font-black text-foreground">
               {Math.round(progress)}%
             </div>
          </div>
          
          <div className="glass p-6 rounded-2xl">
             <h3 className="text-lg font-bold mb-4">Инструкция</h3>
             <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
               <li>Отмечайте задачи по мере выполнения.</li>
               <li>Ежедневные чек-листы сбрасываются в 00:00.</li>
               <li>Вы можете добавлять временные задачи через поле ввода снизу.</li>
             </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChecklistPage;
