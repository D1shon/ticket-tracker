import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { toast } from 'sonner';

const TicketContext = createContext();

export const useTickets = () => useContext(TicketContext);

export const TicketProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const allTicketsRef = useRef([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setTickets([]);
      return;
    }

    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const newData = change.doc.data();
          const oldData = allTicketsRef.current.find(t => t.id === change.doc.id);
          
          if (oldData && oldData.status !== newData.status) {
            const statusLabels = {
              'new': 'Новая',
              'in_progress': 'В работе',
              'paused': 'На паузе',
              'waiting': 'Ожидание',
              'closed': 'Закрыто'
            };
            toast(`Статус изменен: ${statusLabels[newData.status] || newData.status}`, {
              description: `Заявка "${newData.title}"`,
              duration: 5000,
            });
          }
        }
      });

      const ticketsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTickets(ticketsData);
      allTicketsRef.current = ticketsData;
    }, (error) => {
      console.error("Error fetching tickets:", error);
      toast.error("Ошибка загрузки задач");
    });

    return () => unsubscribe();
  }, [user]);

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success("Вход выполнен");
    } catch (error) {
      toast.error("Ошибка входа: " + error.message);
      throw error;
    }
  };

  const logout = () => signOut(auth);

  const addTicket = async (ticketData) => {
    try {
      await addDoc(collection(db, 'tickets'), {
        ...ticketData,
        status: 'new',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        comments: []
      });
      toast.success("Задача создана");
    } catch (error) {
      toast.error("Ошибка создания задачи");
      throw error;
    }
  };

  const updateTicket = async (ticketId, updates) => {
    try {
      await updateDoc(doc(db, 'tickets', ticketId), updates);
    } catch (error) {
      toast.error("Ошибка обновления задачи");
    }
  };

  const addComment = async (ticketId, commentText, attachment = null) => {
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const ticket = allTicketsRef.current.find(t => t.id === ticketId);
      
      const newComment = {
        id: Math.random().toString(36).substr(2, 9),
        text: commentText,
        author: user.email,
        createdAt: new Date().toISOString(),
        attachment
      };

      const updatedComments = [...(ticket?.comments || []), newComment];
      await updateDoc(ticketRef, { comments: updatedComments });
      toast.success("Комментарий добавлен");
    } catch (error) {
      toast.error("Ошибка добавления комментария");
    }
  };

  const uploadFile = async (file, onProgress) => {
    if (!file) return null;
    
    if (!auth.currentUser) {
      toast.error("Необходима авторизация для загрузки");
      return null;
    }

    const fileId = Math.random().toString(36).substr(2, 9);
    const storageRef = ref(storage, `attachments/${fileId}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        }, 
        (error) => {
          toast.error("Ошибка загрузки файла");
          reject(error);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            name: file.name,
            url: downloadURL,
            type: file.type
          });
        }
      );
    });
  };

  return (
    <TicketContext.Provider value={{
      user,
      tickets,
      loading,
      login,
      logout,
      addTicket,
      updateTicket,
      addComment,
      uploadFile
    }}>
      {children}
    </TicketContext.Provider>
  );
};
