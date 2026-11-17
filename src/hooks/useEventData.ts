import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import type {
  CriterionDoc,
  EventSettings,
  FaqItemDoc,
  PublicJurorDoc,
  PublicStats,
  RuleItemDoc,
  ScheduleItemDoc,
} from '../types/hackathon';

export interface PublicEventData {
  settings: EventSettings | null;
  stats: PublicStats | null;
  criteria: CriterionDoc[];
  scheduleItems: ScheduleItemDoc[];
  rules: RuleItemDoc[];
  faqItems: FaqItemDoc[];
  publicJurors: PublicJurorDoc[];
}

export function useEventData() {
  const [data, setData] = useState<PublicEventData>({
    settings: null,
    stats: null,
    criteria: [],
    scheduleItems: [],
    rules: [],
    faqItems: [],
    publicJurors: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        settingsSnap,
        statsSnap,
        criteriaSnap,
        scheduleSnap,
        rulesSnap,
        faqSnap,
        jurorsSnap,
      ] = await Promise.all([
        getDoc(doc(db, 'settings', 'event')).catch((e) =>
          handleFirestoreError(e, OperationType.GET, 'settings/event')
        ),
        getDoc(doc(db, 'stats', 'public')).catch((e) =>
          handleFirestoreError(e, OperationType.GET, 'stats/public')
        ),
        getDocs(query(collection(db, 'criteria'), orderBy('order', 'asc'))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, 'criteria')
        ),
        getDocs(query(collection(db, 'scheduleItems'), orderBy('order', 'asc'))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, 'scheduleItems')
        ),
        getDocs(query(collection(db, 'rules'), orderBy('order', 'asc'))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, 'rules')
        ),
        getDocs(query(collection(db, 'faqItems'), orderBy('order', 'asc'))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, 'faqItems')
        ),
        getDocs(query(collection(db, 'publicJurors'), orderBy('order', 'asc'))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, 'publicJurors')
        ),
      ]);

      setData({
        settings: settingsSnap.exists() ? (settingsSnap.data() as EventSettings) : null,
        stats: statsSnap.exists() ? (statsSnap.data() as PublicStats) : null,
        criteria: criteriaSnap.docs.map((d) => d.data() as CriterionDoc),
        scheduleItems: scheduleSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ScheduleItemDoc)),
        rules: rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RuleItemDoc)),
        faqItems: faqSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FaqItemDoc)),
        publicJurors: jurorsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PublicJurorDoc)),
      });
    } catch (err) {
      console.error('Erro ao carregar conteúdo público:', err);
      setError('Não foi possível carregar os dados do evento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { ...data, loading, error, refetch: fetchData };
}
