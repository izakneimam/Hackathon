import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';
import { normalizeEmail } from './validation';
import type { TeamDoc, TeamMemberDoc } from '../types/hackathon';

type BatchMutation =
  | { type: 'delete'; ref: DocumentReference }
  | { type: 'update'; ref: DocumentReference; data: Record<string, unknown> };

async function commitMutationsInChunks(mutations: BatchMutation[], errorPath: string): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < mutations.length; i += CHUNK_SIZE) {
    const chunk = mutations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const mut of chunk) {
      if (mut.type === 'delete') {
        batch.delete(mut.ref);
      } else {
        batch.update(mut.ref, mut.data);
      }
    }
    await batch.commit().catch((err) => {
      handleFirestoreError(err, OperationType.WRITE, errorPath);
      throw err;
    });
  }
}

/**
 * Exclui o projeto (projects/{teamId}), avaliações relacionadas e resultado consolidado.
 */
export async function adminDeleteProject(teamId: string): Promise<void> {
  const evalsSnap = await getDocs(
    query(collection(db, 'evaluations'), where('projectId', '==', teamId))
  ).catch((err) => {
    handleFirestoreError(err, OperationType.LIST, 'evaluations');
    throw err;
  });

  const mutations: BatchMutation[] = [
    ...evalsSnap.docs.map((d) => ({ type: 'delete' as const, ref: d.ref })),
    { type: 'delete', ref: doc(db, 'results', teamId) },
    { type: 'delete', ref: doc(db, 'projects', teamId) },
  ];

  await commitMutationsInChunks(mutations, `projects/${teamId}`);
}

/**
 * Exclui a equipe, todos os integrantes, memberLocks, projeto, avaliações e resultado,
 * além de limpar teamId do líder e decrementar stats/public.teamCount.
 */
export async function adminDeleteTeam(
  teamId: string,
  options?: { skipUserReset?: boolean }
): Promise<void> {
  const [teamSnap, membersSnap, evalsSnap, statsSnap] = await Promise.all([
    getDoc(doc(db, 'teams', teamId)).catch((err) => {
      handleFirestoreError(err, OperationType.GET, `teams/${teamId}`);
      throw err;
    }),
    getDocs(collection(db, 'teams', teamId, 'members')).catch((err) => {
      handleFirestoreError(err, OperationType.LIST, `teams/${teamId}/members`);
      throw err;
    }),
    getDocs(query(collection(db, 'evaluations'), where('projectId', '==', teamId))).catch((err) => {
      handleFirestoreError(err, OperationType.LIST, 'evaluations');
      throw err;
    }),
    getDoc(doc(db, 'stats', 'public')).catch((err) => {
      handleFirestoreError(err, OperationType.GET, 'stats/public');
      throw err;
    }),
  ]);

  const teamData = teamSnap.exists() ? (teamSnap.data() as Omit<TeamDoc, 'id'>) : null;
  const mutations: BatchMutation[] = [];
  const lockEmails = new Set<string>();

  for (const mDoc of membersSnap.docs) {
    mutations.push({ type: 'delete', ref: mDoc.ref });
    const mData = mDoc.data() as Partial<TeamMemberDoc>;
    const normalized = mData.normalizedEmail || (mData.email ? normalizeEmail(mData.email) : '');
    if (normalized) {
      lockEmails.add(normalized);
    }
  }

  if (teamData?.leaderEmail) {
    const leaderNorm = normalizeEmail(teamData.leaderEmail);
    if (leaderNorm && !lockEmails.has(leaderNorm)) {
      const lockSnap = await getDoc(doc(db, 'memberLocks', leaderNorm)).catch(() => null);
      if (lockSnap?.exists() && lockSnap.data()?.teamId === teamId) {
        lockEmails.add(leaderNorm);
      }
    }
  }

  for (const emailKey of lockEmails) {
    mutations.push({ type: 'delete', ref: doc(db, 'memberLocks', emailKey) });
  }

  for (const evDoc of evalsSnap.docs) {
    mutations.push({ type: 'delete', ref: evDoc.ref });
  }

  mutations.push({ type: 'delete', ref: doc(db, 'results', teamId) });
  mutations.push({ type: 'delete', ref: doc(db, 'projects', teamId) });

  if (teamSnap.exists()) {
    mutations.push({ type: 'delete', ref: doc(db, 'teams', teamId) });
  }

  if (!options?.skipUserReset && teamData?.leaderUid) {
    const userRef = doc(db, 'users', teamData.leaderUid);
    const userSnap = await getDoc(userRef).catch(() => null);
    if (userSnap?.exists() && userSnap.data()?.teamId === teamId) {
      mutations.push({
        type: 'update',
        ref: userRef,
        data: {
          teamId: deleteField(),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  if (teamSnap.exists() && statsSnap.exists()) {
    const currentCount = Number(statsSnap.data()?.teamCount ?? 0);
    mutations.push({
      type: 'update',
      ref: doc(db, 'stats', 'public'),
      data: {
        teamCount: Math.max(0, currentCount - 1),
        updatedAt: serverTimestamp(),
      },
    });
  }

  await commitMutationsInChunks(mutations, `teams/${teamId}`);
}

/**
 * Exclui os registros do usuário no Firestore (users e userRoles), suas avaliações como jurado
 * e, caso seja líder de uma equipe, remove a equipe em cascata.
 */
export async function adminDeleteUser(uid: string, email?: string): Promise<void> {
  if (auth.currentUser?.uid === uid) {
    throw new Error('Você não pode excluir a própria conta de administrador logada.');
  }

  // Verificar equipes lideradas por este usuário (ou com id == uid) e perfis/papéis para limpar locks
  const [teamsByLeaderSnap, directTeamSnap, jurorEvalsSnap, userDocSnap, roleDocSnap] =
    await Promise.all([
      getDocs(query(collection(db, 'teams'), where('leaderUid', '==', uid))).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, 'teams');
        throw err;
      }),
      getDoc(doc(db, 'teams', uid)).catch((err) => {
        handleFirestoreError(err, OperationType.GET, `teams/${uid}`);
        throw err;
      }),
      getDocs(query(collection(db, 'evaluations'), where('jurorUid', '==', uid))).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, 'evaluations');
        throw err;
      }),
      getDoc(doc(db, 'users', uid)).catch(() => null),
      getDoc(doc(db, 'userRoles', uid)).catch(() => null),
    ]);

  const teamIdsToDelete = new Set<string>();
  for (const d of teamsByLeaderSnap.docs) {
    teamIdsToDelete.add(d.id);
  }
  if (directTeamSnap.exists()) {
    teamIdsToDelete.add(directTeamSnap.id);
  }

  for (const teamId of teamIdsToDelete) {
    await adminDeleteTeam(teamId, { skipUserReset: true });
  }

  const mutations: BatchMutation[] = [];

  for (const evDoc of jurorEvalsSnap.docs) {
    mutations.push({ type: 'delete', ref: evDoc.ref });
  }

  const candidateEmails = new Set<string>();
  for (const raw of [email, userDocSnap?.data()?.email, roleDocSnap?.data()?.email]) {
    if (typeof raw === 'string' && raw.includes('@')) {
      candidateEmails.add(normalizeEmail(raw));
    }
  }

  for (const norm of candidateEmails) {
    const lockRef = doc(db, 'memberLocks', norm);
    const lockSnap = await getDoc(lockRef).catch(() => null);
    if (lockSnap?.exists() && (lockSnap.data()?.leaderUid === uid || lockSnap.data()?.teamId === uid)) {
      mutations.push({ type: 'delete', ref: lockRef });
    }
  }

  mutations.push({ type: 'delete', ref: doc(db, 'users', uid) });
  mutations.push({ type: 'delete', ref: doc(db, 'userRoles', uid) });

  await commitMutationsInChunks(mutations, `users/${uid}`);
}
