import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'hackathon-ifpr-rules-test';
let testEnv: RulesTestEnvironment;

const futureDate = Timestamp.fromMillis(Date.now() + 86400 * 1000 * 7);
const pastDate = Timestamp.fromMillis(Date.now() - 86400 * 1000);

async function seedBase(deadline: Timestamp = futureDate, evaluationOpen = true, gradesReleased = false) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'settings', 'event'), {
      eventTitle: '1º Hackathon CC IFPR',
      eventSubtitle: 'Ciência da Computação',
      campusLabel: 'IFPR Campus Pinhais',
      heroBadge: 'Presencial',
      heroTag: '1º HACKATHON',
      heroTitleLine1: '1º Hackathon de',
      heroTitleHighlight: 'Ciência da Computação',
      heroDescription: 'Descrição do evento',
      startsAt: futureDate,
      submissionDeadline: deadline,
      maxTeams: 25,
      teamMinMembers: 3,
      teamMaxMembers: 5,
      maxExternalMembers: 1,
      evaluationOpen,
      gradesReleased,
      contactEmail: 'hackathon.cc@ifpr.edu.br',
      contactLocation: 'IFPR',
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'stats', 'public'), {
      teamCount: 2,
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'userRoles', 'leaderA'), {
      role: 'participante',
      email: 'leadera@estudantes.ifpr.edu.br',
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'userRoles', 'leaderB'), {
      role: 'participante',
      email: 'leaderb@estudantes.ifpr.edu.br',
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'userRoles', 'juror1'), {
      role: 'jurado',
      email: 'juror1@ifpr.edu.br',
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'userRoles', 'juror2'), {
      role: 'jurado',
      email: 'juror2@ifpr.edu.br',
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'teams', 'leaderA'), {
      name: 'Equipe Alpha',
      number: 1,
      leaderUid: 'leaderA',
      leaderName: 'Líder A',
      leaderEmail: 'leadera@estudantes.ifpr.edu.br',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'teams', 'leaderB'), {
      name: 'Equipe Beta',
      number: 2,
      leaderUid: 'leaderB',
      leaderName: 'Líder B',
      leaderEmail: 'leaderb@estudantes.ifpr.edu.br',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'memberLocks', 'leadera@estudantes.ifpr.edu.br'), {
      teamId: 'leaderA',
      leaderUid: 'leaderA',
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'projects', 'leaderA'), {
      teamId: 'leaderA',
      leaderUid: 'leaderA',
      teamName: 'Equipe Alpha',
      teamNumber: 1,
      name: 'Projeto Alpha',
      shortDescription: 'Resumo',
      fullDescription: 'Descrição completa',
      track: 'Inovação na Educação (EdTech)',
      technologies: ['React'],
      githubUrl: 'https://github.com/alpha/repo',
      isRepoPublicDeclared: true,
      demoUrl: '',
      slidesPath: '',
      slidesName: '',
      slidesSize: 0,
      screenshots: [],
      status: 'rascunho',
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'projects', 'leaderB'), {
      teamId: 'leaderB',
      leaderUid: 'leaderB',
      teamName: 'Equipe Beta',
      teamNumber: 2,
      name: 'Projeto Beta',
      shortDescription: 'Resumo Beta',
      fullDescription: 'Descrição Beta',
      track: 'Inteligência Artificial Aplicada',
      technologies: ['Python'],
      githubUrl: 'https://github.com/beta/repo',
      isRepoPublicDeclared: true,
      demoUrl: '',
      slidesPath: '',
      slidesName: '',
      slidesSize: 0,
      screenshots: [],
      status: 'enviado',
      submittedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'evaluations', 'leaderB_juror2'), {
      projectId: 'leaderB',
      jurorUid: 'juror2',
      jurorName: 'Jurado 2',
      scores: { inovacao: 90, tecnica: 85, demo: 90, impacto: 80, pitch: 85 },
      comment: 'Bom trabalho',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
}

describe('Hackathon IFPR Firestore Security Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedBase();
  });

  it('Equipe A lê seus próprios dados, mas NÃO lê dados da Equipe B', async () => {
    const ctxA = testEnv.authenticatedContext('leaderA', {
      email: 'leadera@estudantes.ifpr.edu.br',
      email_verified: true,
    });
    const dbA = ctxA.firestore();
    await assertSucceeds(getDoc(doc(dbA, 'teams', 'leaderA')));
    await assertSucceeds(getDoc(doc(dbA, 'projects', 'leaderA')));
    await assertFails(getDoc(doc(dbA, 'teams', 'leaderB')));
    await assertFails(getDoc(doc(dbA, 'projects', 'leaderB')));
  });

  it('Participante NÃO pode se auto-promover a organizacao ou jurado', async () => {
    const ctxNew = testEnv.authenticatedContext('newUser', {
      email: 'novo@estudantes.ifpr.edu.br',
      email_verified: true,
    });
    await assertFails(
      setDoc(doc(ctxNew.firestore(), 'userRoles', 'newUser'), {
        role: 'organizacao',
        email: 'novo@estudantes.ifpr.edu.br',
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('Participante NÃO pode alterar status do projeto para avaliado nem enviar sem campos obrigatórios', async () => {
    const ctxA = testEnv.authenticatedContext('leaderA', {
      email: 'leadera@estudantes.ifpr.edu.br',
      email_verified: true,
    });
    await assertFails(
      updateDoc(doc(ctxA.firestore(), 'projects', 'leaderA'), {
        status: 'avaliado',
      })
    );
    await assertFails(
      updateDoc(doc(ctxA.firestore(), 'projects', 'leaderA'), {
        status: 'enviado',
      })
    );
  });

  it('Ninguém edita projeto em rascunho depois do submissionDeadline', async () => {
    await testEnv.clearFirestore();
    await seedBase(pastDate);
    const ctxA = testEnv.authenticatedContext('leaderA', {
      email: 'leadera@estudantes.ifpr.edu.br',
      email_verified: true,
    });
    await assertFails(
      updateDoc(doc(ctxA.firestore(), 'projects', 'leaderA'), {
        name: 'Tentativa pós-prazo',
      })
    );
  });

  it('Jurado NÃO lê avaliação de outro jurado e NÃO lê rascunho', async () => {
    const ctxJ1 = testEnv.authenticatedContext('juror1', {
      email: 'juror1@ifpr.edu.br',
      email_verified: true,
    });
    const dbJ1 = ctxJ1.firestore();
    await assertFails(getDoc(doc(dbJ1, 'projects', 'leaderA')));
    await assertSucceeds(getDoc(doc(dbJ1, 'projects', 'leaderB')));
    await assertFails(getDoc(doc(dbJ1, 'evaluations', 'leaderB_juror2')));
  });

  it('Participante e jurado NÃO podem escrever em results', async () => {
    const ctxA = testEnv.authenticatedContext('leaderA', {
      email: 'leadera@estudantes.ifpr.edu.br',
      email_verified: true,
    });
    await assertFails(
      setDoc(doc(ctxA.firestore(), 'results', 'leaderA'), {
        projectId: 'leaderA',
        finalScore: 10,
        evaluationCount: 1,
        rank: 1,
      })
    );
  });
});
