import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  setDoc,
  doc,
  documentId,
  where,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { format, subDays } from 'date-fns';
import { db, auth } from '../lib/firebase';
import { useTickets } from './TicketContext';
import { toast } from 'sonner';

const ChecklistContext = createContext();

export const useChecklist = () => useContext(ChecklistContext);

export const ChecklistProvider = ({ children }) => {
  const { user } = useTickets();
  const [checklistData, setChecklistData] = useState({});
  const [loading, setLoading] = useState(true);
  // Живые данные (сегодня + вчера) и догруженные по запросу даты держим отдельно:
  // живой снапшот всегда главнее, догруженное старое не затирается
  const liveRef = React.useRef({});
  const extraRef = React.useRef({});
  const loadedDatesRef = React.useRef(new Set());
  const merge = () => setChecklistData({ ...extraRef.current, ...liveRef.current });

  // Чек-листы за конкретную дату старше вчерашней — по запросу (листание назад,
  // открытие старого чек-листа по ссылке). Решение шефа 21.10.2026: фоном только 2 дня.
  const loadChecklistDate = async (dateKey) => {
    if (!dateKey || loadedDatesRef.current.has(dateKey)) return;
    loadedDatesRef.current.add(dateKey);
    try {
      const snap = await getDocs(query(collection(db, 'checklists'), where(documentId(), '>=', `${dateKey}_`), where(documentId(), '<=', `${dateKey}_`)));
      snap.docs.forEach(d => { extraRef.current[d.id] = d.data(); });
      merge();
    } catch (e) {
      loadedDatesRef.current.delete(dateKey);
      console.error('[ChecklistContext] date load error:', e.message);
    }
  };

  // Safely subscribe to checklists only after Firebase Auth credentials are fully established
  useEffect(() => {
    let unsubscribeChecklists = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Authenticated session ready, attach live listener
        // Doc id = `${dateKey}_club_shift_card`, dateKey = yyyy-MM-dd — lexicographic
        // order matches chronological order, so a range on the doc id itself bounds
        // by date WITHOUT a composite index (single-field range, natively indexed).
        // Without this the collection was read whole and grows every day forever.
        // Фоном — только сегодня и вчера (по факту людям нужны именно они);
        // всё старше подтягивается loadChecklistDate() при листании назад.
        const cutoff = format(subDays(new Date(), 1), 'yyyy-MM-dd');
        const q = query(collection(db, 'checklists'), where(documentId(), '>=', cutoff));

        // Clean up previous subscription just in case
        if (unsubscribeChecklists) {
          unsubscribeChecklists();
        }

        unsubscribeChecklists = onSnapshot(q, (snapshot) => {
          const data = {};
          snapshot.docs.forEach(doc => {
            data[doc.id] = doc.data();
          });
          liveRef.current = data;
          merge();
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
        liveRef.current = {};
        extraRef.current = {};
        loadedDatesRef.current = new Set();
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
      saveSessionInspector,
      loadChecklistDate
    }}>
      {children}
    </ChecklistContext.Provider>
  );
};
