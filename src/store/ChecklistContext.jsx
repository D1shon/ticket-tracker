import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  setDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useTickets } from './TicketContext';
import { toast } from 'sonner';

const ChecklistContext = createContext();

export const useChecklist = () => useContext(ChecklistContext);

export const ChecklistProvider = ({ children }) => {
  const { user } = useTickets();
  const [checklistData, setChecklistData] = useState({});
  const [loading, setLoading] = useState(true);

  // Safely subscribe to checklists only after Firebase Auth credentials are fully established
  useEffect(() => {
    let unsubscribeChecklists = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Authenticated session ready, attach live listener
        const q = query(collection(db, 'checklists'));
        
        // Clean up previous subscription just in case
        if (unsubscribeChecklists) {
          unsubscribeChecklists();
        }

        unsubscribeChecklists = onSnapshot(q, (snapshot) => {
          const data = {};
          snapshot.docs.forEach(doc => {
            data[doc.id] = doc.data();
          });
          setChecklistData(data);
          setLoading(false);
        }, (error) => {
          console.error('[ChecklistContext] subscription error:', error);
          if (error.code !== 'cancelled') {
            toast.error(`Ошибка загрузки чек-листов: ${error.message}`);
          }
        });
      } else {
        // No authenticated session, detach listener and clear state
        if (unsubscribeChecklists) {
          unsubscribeChecklists();
          unsubscribeChecklists = null;
        }
        setChecklistData({});
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeChecklists) {
        unsubscribeChecklists();
      }
    };
  }, []);

  const updateCheckState = async (dateKey, shiftId, cardId, club, itemStates, itemIssues, itemTimestamps, itemRepeats) => {
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
        repeats: itemRepeats || {},
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'system'
      });
    } catch (error) {
      console.error("Error updating checklist:", error);
      toast.error(`Ошибка сохранения чек-листа в облаке: ${error.message || error}`);
    }
  };

  const saveSessionInspector = async (dateKey, club, sessionGroupId, inspectorName) => {
    try {
      const docId = `${dateKey}_${club}_session_${sessionGroupId}`;
      await setDoc(doc(db, 'checklists', docId), {
        dateKey,
        club,
        sessionGroupId,
        inspectorName,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || 'system'
      });
    } catch (error) {
      console.error("Error saving session inspector:", error);
    }
  };

  return (
    <ChecklistContext.Provider value={{
      checklistData,
      loading,
      updateCheckState,
      saveSessionInspector
    }}>
      {children}
    </ChecklistContext.Provider>
  );
};
