import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTickets } from './TicketContext';
import { toast } from 'sonner';

const ChecklistContext = createContext();

export const useChecklist = () => useContext(ChecklistContext);

export const ChecklistProvider = ({ children }) => {
  const { user } = useTickets();
  const [checklistData, setChecklistData] = useState({});
  const [loading, setLoading] = useState(true);

  // Subscribe to checklists collection immediately on mount to prevent any race conditions with auth
  useEffect(() => {
    const q = query(collection(db, 'checklists'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data();
      });
      setChecklistData(data);
      setLoading(false);
    }, (error) => {
      console.error('[ChecklistContext] subscription error:', error);
      toast.error(`Ошибка загрузки чек-листов: ${error.message}`);
    });

    return () => unsubscribe();
  }, []);

  const updateCheckState = async (dateKey, shiftId, cardId, club, itemStates, itemIssues, itemTimestamps) => {
    try {
      const docId = `${dateKey}_${club}_${shiftId}_${cardId}`;
      await setDoc(doc(db, 'checklists', docId), {
        dateKey,
        shiftId,
        cardId,
        club,
        states: itemStates,
        issues: itemIssues,
        timestamps: itemTimestamps || {},
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'system'
      });
    } catch (error) {
      console.error("Error updating checklist:", error);
      toast.error(`Ошибка сохранения чек-листа в облаке: ${error.message || error}`);
    }
  };

  return (
    <ChecklistContext.Provider value={{
      checklistData,
      loading,
      updateCheckState
    }}>
      {children}
    </ChecklistContext.Provider>
  );
};
