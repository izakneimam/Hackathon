import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const app = initializeApp();
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-3f491c0a-7708-4ad9-bd7d-6fecf58a9e26';
const db = getFirestore(app, DATABASE_ID);
const bucket = getStorage(app).bucket();

const ALLOWED_TRACKS = new Set([
  'Inovação na Educação (EdTech)',
  'Sustentabilidade e Meio Ambiente',
  'Inteligência Artificial Aplicada',
  'Acessibilidade e Inclusão Digital',
]);

const REPO_URL_REGEX = /^https:\/\/(github\.com|gitlab\.com)\/[^\s/]+\/[^\s/]+/i;
const DEMO_URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export const getServerTime = onCall({ region: 'southamerica-east1' }, async () => {
  return { serverTimeMs: Date.now() };
});

export const submitProject = onCall({ region: 'southamerica-east1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuário não autenticado.');
  }

  const uid = request.auth.uid;
  const emailVerified = request.auth.token.email_verified === true;
  if (!emailVerified) {
    throw new HttpsError('failed-precondition', 'Confirme seu e-mail institucional antes de enviar o projeto.');
  }

  const roleSnap = await db.collection('userRoles').doc(uid).get();
  if (!roleSnap.exists || roleSnap.data()?.role !== 'participante') {
    throw new HttpsError('permission-denied', 'Apenas líderes participantes podem enviar projetos.');
  }

  const eventSnap = await db.collection('settings').doc('event').get();
  if (!eventSnap.exists) {
    throw new HttpsError('failed-precondition', 'Configurações do evento não encontradas.');
  }

  const eventData = eventSnap.data()!;
  const deadline = eventData.submissionDeadline as Timestamp;
  const serverNow = Timestamp.now();

  if (deadline && serverNow.toMillis() > deadline.toMillis()) {
    throw new HttpsError('failed-precondition', 'O prazo de envio do hackathon já foi encerrado.');
  }

  const teamId = uid;
  const teamSnap = await db.collection('teams').doc(teamId).get();
  const projectRef = db.collection('projects').doc(teamId);
  const projectSnap = await projectRef.get();

  if (!teamSnap.exists || !projectSnap.exists) {
    throw new HttpsError('not-found', 'Equipe ou projeto não encontrado.');
  }

  const teamData = teamSnap.data()!;
  const projectData = projectSnap.data()!;

  if (teamData.leaderUid !== uid || projectData.leaderUid !== uid) {
    throw new HttpsError('permission-denied', 'Somente o líder da equipe pode enviar o projeto.');
  }

  if (projectData.status !== 'rascunho') {
    throw new HttpsError('failed-precondition', 'Este projeto já foi submetido ou encerrado.');
  }

  // Validar campos do projeto
  const name = String(projectData.name || '').trim();
  const shortDescription = String(projectData.shortDescription || '').trim();
  const fullDescription = String(projectData.fullDescription || '').trim();
  const track = String(projectData.track || '').trim();
  const githubUrl = String(projectData.githubUrl || '').trim();
  const demoUrl = String(projectData.demoUrl || '').trim();
  const isRepoPublicDeclared = projectData.isRepoPublicDeclared === true;
  const slidesPath = String(projectData.slidesPath || '').trim();
  const screenshots = Array.isArray(projectData.screenshots) ? projectData.screenshots : [];

  if (name.length < 2 || name.length > 140) {
    throw new HttpsError('invalid-argument', 'Informe o nome do projeto (2 a 140 caracteres).');
  }
  if (shortDescription.length < 10 || shortDescription.length > 200) {
    throw new HttpsError('invalid-argument', 'Informe o resumo curto com 10 a 200 caracteres.');
  }
  if (fullDescription.length < 20 || fullDescription.length > 4000) {
    throw new HttpsError('invalid-argument', 'Informe a descrição completa do projeto (mínimo 20 caracteres).');
  }
  if (!ALLOWED_TRACKS.has(track)) {
    throw new HttpsError('invalid-argument', 'Selecione uma trilha válida.');
  }
  if (!REPO_URL_REGEX.test(githubUrl)) {
    throw new HttpsError('invalid-argument', 'Informe uma URL válida do GitHub ou GitLab (https://github.com/... ou https://gitlab.com/...).');
  }
  if (!isRepoPublicDeclared) {
    throw new HttpsError('invalid-argument', 'É obrigatório declarar que o repositório está público.');
  }
  if (demoUrl && !DEMO_URL_REGEX.test(demoUrl)) {
    throw new HttpsError('invalid-argument', 'A URL da demonstração/vídeo informada é inválida.');
  }
  if (screenshots.length > 5) {
    throw new HttpsError('invalid-argument', 'São permitidos no máximo 5 screenshots.');
  }

  // Validar integrantes (3 a 5 e no máximo 1 externo)
  const membersSnap = await db.collection('teams').doc(teamId).collection('members').get();
  const minMembers = Number(eventData.teamMinMembers ?? 3);
  const maxMembers = Number(eventData.teamMaxMembers ?? 5);
  const maxExternal = Number(eventData.maxExternalMembers ?? 1);

  if (membersSnap.size < minMembers || membersSnap.size > maxMembers) {
    throw new HttpsError(
      'failed-precondition',
      `A equipe precisa ter entre ${minMembers} e ${maxMembers} integrantes (atual: ${membersSnap.size}).`
    );
  }

  const externalCount = membersSnap.docs.filter((d) => d.data().isExternal === true).length;
  if (externalCount > maxExternal) {
    throw new HttpsError(
      'failed-precondition',
      `Cada equipe pode ter no máximo ${maxExternal} integrante externo.`
    );
  }

  // Validar slides.pdf no Cloud Storage
  const expectedSlidesPath = `projects/${teamId}/slides.pdf`;
  if (slidesPath !== expectedSlidesPath) {
    throw new HttpsError('invalid-argument', 'Anexe os slides do pitch em formato PDF antes de enviar.');
  }

  const slidesFile = bucket.file(expectedSlidesPath);
  const [slidesExists] = await slidesFile.exists();
  if (!slidesExists) {
    throw new HttpsError('failed-precondition', 'O arquivo PDF dos slides não foi encontrado no Storage.');
  }
  const [slidesMeta] = await slidesFile.getMetadata();
  const slidesSize = Number(slidesMeta.size || 0);
  if (slidesMeta.contentType !== 'application/pdf' || slidesSize <= 0 || slidesSize > 10 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'Os slides devem estar em PDF válido com no máximo 10 MB.');
  }

  // Validar screenshots no Cloud Storage
  for (const shot of screenshots) {
    const shotPath = String(shot?.path || '');
    if (!shotPath.startsWith(`projects/${teamId}/screenshots/`)) {
      throw new HttpsError('invalid-argument', 'Caminho de screenshot inválido.');
    }
    const shotFile = bucket.file(shotPath);
    const [shotExists] = await shotFile.exists();
    if (!shotExists) {
      throw new HttpsError('failed-precondition', 'Um dos screenshots listados não foi encontrado no Storage.');
    }
    const [shotMeta] = await shotFile.getMetadata();
    const shotSize = Number(shotMeta.size || 0);
    if (!String(shotMeta.contentType || '').startsWith('image/') || shotSize <= 0 || shotSize > 5 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', 'Todos os screenshots devem ser imagens válidas de até 5 MB.');
    }
  }

  await projectRef.update({
    status: 'enviado',
    submittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, status: 'enviado' };
});

export const closeExpiredDrafts = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'southamerica-east1',
    timeZone: 'America/Sao_Paulo',
  },
  async () => {
    const eventSnap = await db.collection('settings').doc('event').get();
    if (!eventSnap.exists) return;

    const deadline = eventSnap.data()?.submissionDeadline as Timestamp | undefined;
    if (!deadline || Timestamp.now().toMillis() <= deadline.toMillis()) {
      return;
    }

    const draftsSnap = await db.collection('projects').where('status', '==', 'rascunho').get();
    if (draftsSnap.empty) return;

    const batch = db.batch();
    for (const docSnap of draftsSnap.docs) {
      batch.update(docSnap.ref, {
        status: 'encerrado',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
);
