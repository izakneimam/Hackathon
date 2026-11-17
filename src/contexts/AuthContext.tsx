import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { normalizeEmail } from '../lib/validation';
import type { UserProfile, UserRoleDoc, UserRoleType } from '../types/hackathon';

interface AuthContextValue {
  user: User | null;
  role: UserRoleType | null;
  profile: UserProfile | null;
  loading: boolean;
  provisioningTeam: boolean;
  signOut: () => Promise<void>;
  refreshUserState: () => Promise<{ user: User | null; role: UserRoleType | null; profile: UserProfile | null }>;
  ensureTeamProvisioned: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function getDashboardPathForRole(role: UserRoleType | null): string {
  switch (role) {
    case 'organizacao':
      return '/admin';
    case 'jurado':
      return '/jurado';
    case 'participante':
      return '/equipe';
    default:
      return '/login';
  }
}

export function getRoleLabel(role: UserRoleType): string {
  switch (role) {
    case 'organizacao':
      return 'Organização';
    case 'jurado':
      return 'Jurado';
    case 'participante':
      return 'Participante';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRoleType | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [provisioningTeam, setProvisioningTeam] = useState(false);

  const loadUserDocs = useCallback(async (firebaseUser: User) => {
    let fetchedRole: UserRoleType | null = null;
    let fetchedProfile: UserProfile | null = null;

    try {
      const roleSnap = await getDoc(doc(db, 'userRoles', firebaseUser.uid));
      if (roleSnap.exists()) {
        fetchedRole = (roleSnap.data() as UserRoleDoc).role;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `userRoles/${firebaseUser.uid}`);
    }

    try {
      const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (profileSnap.exists()) {
        fetchedProfile = profileSnap.data() as UserProfile;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
    }

    setRole(fetchedRole);
    setProfile(fetchedProfile);
    return { role: fetchedRole, profile: fetchedProfile };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setRole(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        await loadUserDocs(firebaseUser);
      } catch (err) {
        console.error('Erro ao carregar perfil/role do usuário:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [loadUserDocs]);

  const refreshUserState = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) {
      setUser(null);
      setRole(null);
      setProfile(null);
      return { user: null, role: null, profile: null };
    }
    await current.reload();
    await current.getIdToken(true);
    setUser(auth.currentUser);
    const docs = await loadUserDocs(current);
    return { user: auth.currentUser, ...docs };
  }, [loadUserDocs]);

  const ensureTeamProvisioned = useCallback(async () => {
    const current = auth.currentUser;
    if (!current || !current.emailVerified || !current.email) return;

    setProvisioningTeam(true);
    try {
      const teamRef = doc(db, 'teams', current.uid);
      const existingTeam = await getDoc(teamRef);
      if (existingTeam.exists()) {
        await loadUserDocs(current);
        return;
      }

      const userRef = doc(db, 'users', current.uid);
      const statsRef = doc(db, 'stats', 'public');
      const eventRef = doc(db, 'settings', 'event');
      const projectRef = doc(db, 'projects', current.uid);
      const memberRef = doc(db, 'teams', current.uid, 'members', current.uid);
      const normalized = normalizeEmail(current.email);
      const lockRef = doc(db, 'memberLocks', normalized);

      await runTransaction(db, async (tx) => {
        const [teamSnap, statsSnap, eventSnap, userSnap, lockSnap] = await Promise.all([
          tx.get(teamRef),
          tx.get(statsRef),
          tx.get(eventRef),
          tx.get(userRef),
          tx.get(lockRef),
        ]);

        if (teamSnap.exists()) return;

        if (!statsSnap.exists() || !eventSnap.exists()) {
          throw new Error('Configurações do evento não encontradas. Contate a organização.');
        }

        const currentCount = Number(statsSnap.data().teamCount ?? 0);
        const maxTeams = Number(eventSnap.data().maxTeams ?? 25);

        if (currentCount >= maxTeams) {
          throw new Error('O limite máximo de equipes inscritas já foi atingido.');
        }

        if (lockSnap.exists()) {
          throw new Error('Este e-mail institucional já está vinculado a uma equipe.');
        }

        const userData = userSnap.exists() ? (userSnap.data() as UserProfile) : null;
        const leaderName = userData?.name || current.displayName || 'Líder da Equipe';
        const teamName = userData?.pendingTeamName?.trim() || `Equipe ${leaderName.split(' ')[0]}`;
        const teamNumber = currentCount + 1;

        tx.update(statsRef, {
          teamCount: teamNumber,
          updatedAt: serverTimestamp(),
        });

        tx.set(teamRef, {
          name: teamName,
          number: teamNumber,
          leaderUid: current.uid,
          leaderName,
          leaderEmail: current.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(lockRef, {
          teamId: current.uid,
          leaderUid: current.uid,
          createdAt: serverTimestamp(),
        });

        tx.set(memberRef, {
          name: leaderName,
          email: current.email,
          normalizedEmail: normalized,
          course: 'Ciência da Computação',
          semester: '1º Semestre',
          isExternal: false,
          isLeader: true,
          createdAt: serverTimestamp(),
        });

        tx.set(projectRef, {
          teamId: current.uid,
          leaderUid: current.uid,
          teamName,
          teamNumber,
          name: '',
          shortDescription: '',
          fullDescription: '',
          track: 'Inovação na Educação (EdTech)',
          technologies: [],
          githubUrl: '',
          isRepoPublicDeclared: false,
          demoUrl: '',
          slidesUrl: '',
          slidesPath: '',
          slidesName: '',
          slidesSize: 0,
          screenshots: [],
          status: 'rascunho',
          updatedAt: serverTimestamp(),
        });

        if (userSnap.exists()) {
          tx.update(userRef, {
            teamId: current.uid,
            updatedAt: serverTimestamp(),
          });
        }
      });

      await loadUserDocs(current);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('limite') || err.message.includes('Configurações') || err.message.includes('vinculado'))) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `teams/${current.uid}`);
    } finally {
      setProvisioningTeam(false);
    }
  }, [loadUserDocs]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setRole(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        profile,
        loading,
        provisioningTeam,
        signOut,
        refreshUserState,
        ensureTeamProvisioned,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return ctx;
}
