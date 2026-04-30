import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Paperclip, 
  Clock, 
  CheckCircle2, 
  Pause,
  ChevronLeft
} from 'lucide-react';
import { useTickets } from '../store/TicketContext';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const TicketDetail = ({ ticketId, onClose }) => {
  const { tickets, updateTicket, addComment, uploadFile } = useTickets();
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const ticket = tickets.find(t => t.id === ticketId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [ticket?.comments]);

  if (!ticket) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    await addComment(ticketId, message);
    setMessage('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const attachment = await uploadFile(file, (p) => setProgress(p));
      await addComment(ticketId, `Отправлен файл: ${file.name}`, attachment);
    } catch (error) {
      console.error(error);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="flex flex-col h-full glass rounded-2xl overflow-hidden border border-border shadow-2xl animate-in fade-in zoom-in-95 duration-300">
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-xl transition-all">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="font-bold text-foreground line-clamp-1">{ticket.title}</h2>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">#{ticket.id?.slice(-6)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={() => updateTicket(ticketId, { status: 'completed' })}
             className="p-2 text-green-500 hover:bg-green-500/10 rounded-xl transition-all"
           >
             <CheckCircle2 size={20} />
           </button>
           <button className="p-2 hover:bg-muted rounded-xl transition-all">
             <X size={20} onClick={onClose} />
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
        <div className="bg-muted/30 p-4 rounded-xl border border-border">
          <h3 className="text-sm font-bold text-muted-foreground mb-2 uppercase tracking-wider">Описание</h3>
          <p className="text-foreground leading-relaxed">{ticket.description}</p>
        </div>

        <div className="space-y-4 pt-4">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Чат и история</h3>
          {ticket.comments?.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-1 max-w-[85%]">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-bold text-primary uppercase">{comment.author?.split('@')[0]}</span>
                <span className="text-[10px] text-muted-foreground">{comment.createdAt && format(new Date(comment.createdAt), 'HH:mm')}</span>
              </div>
              <div className="bg-muted p-3 rounded-2xl rounded-tl-none border border-border/50 text-sm">
                {comment.text}
                {comment.attachment && (
                  <div className="mt-3 p-2 bg-background/50 rounded-xl border border-border flex items-center gap-3">
                     <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                       <Paperclip size={18} />
                     </div>
                     <div className="flex-1 overflow-hidden">
                       <p className="text-xs font-bold truncate">{comment.attachment.name}</p>
                       <a href={comment.attachment.url} target="_blank" className="text-[10px] text-primary hover:underline">Скачать</a>
                     </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-muted/20 border-t border-border">
        {uploading && (
          <div className="mb-4 space-y-1">
             <div className="flex justify-between text-[10px] font-bold text-primary px-1">
               <span>Загрузка файла...</span>
               <span>{Math.round(progress)}%</span>
             </div>
             <div className="h-1.5 bg-muted rounded-full overflow-hidden">
               <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }}></div>
             </div>
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Напишите сообщение..."
              className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-primary/50 resize-none max-h-32 transition-all"
              rows={1}
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="absolute right-3 bottom-3 p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
            >
              <Paperclip size={18} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload}
              className="hidden" 
            />
          </div>
          <button 
            type="submit"
            className="bg-primary hover:bg-primary/90 text-white p-3 rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
            disabled={!message.trim()}
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default TicketDetail;
