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

const ChecklistContext = createContext();

export const useChecklist = () => useContext(ChecklistContext);

export const ChecklistProvider = ({ children }) => {
  const { user } = useTickets();
  const [checklistData, setChecklistData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'checklists'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = {};
      snapshot.docs.forEach(doc => {
        data[doc.id] = doc.data();
      });
      setChecklistData(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const updateCheckState = async (dateKey, shiftId, cardId, itemStates, itemIssues) => {
    try {
      const docId = `${dateKey}_${shiftId}_${cardId}`;
      await setDoc(doc(db, 'checklists', docId), {
        dateKey,
        shiftId,
        cardId,
        states: itemStates,
        issues: itemIssues,
        updatedAt: serverTimestamp(),
        updatedBy: user.email
      });
    } catch (error) {
      console.error("Error updating checklist:", error);
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
