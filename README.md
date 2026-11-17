# Plataforma Oficial — 1º Hackathon de Ciência da Computação IFPR

Aplicação web completa para inscrição de equipes, submissão de projetos, avaliação por banca de jurados e gestão do evento pela organização.

## Stack

- **Front-end**: React 19, Vite, TypeScript, Tailwind CSS, React Router, Zod, Font Awesome 6
- **Backend (100% compatível com o plano gratuito Spark)**: Firebase Authentication (E-mail/Senha) e Cloud Firestore com Security Rules restritivas + Índices compostos

---

## Configuração Inicial no Firebase Console

1. **Ative o provedor E-mail/Senha no Firebase Authentication**:
   - Acesse o [Firebase Console](https://console.firebase.google.com/) e selecione o projeto configurado em `firebase-applet-config.json` (`commanding-circuit-75gvv`).
   - Vá em **Authentication > Sign-in method** e habilite **E-mail/senha**.
   - Em **Authentication > Templates**, ajuste o idioma para **Português (Brasil)** para os e-mails de verificação e redefinição de senha.

2. **Crie a primeira conta de Organização manualmente**:
   - No Firebase Console, vá em **Authentication > Users** e clique em **Adicionar usuário (Add user)**.
   - Informe o e-mail e a senha da coordenação (ex.: `org.hackathon@ifpr.edu.br`) e salve.
   - Copie o **UID** gerado para esse usuário.
   - No Firebase Console, vá em **Firestore Database** e selecione o banco configurado em `firebase-applet-config.json` (`ai-studio-3f491c0a-7708-4ad9-bd7d-6fecf58a9e26`).
   - Crie a coleção `userRoles` e adicione um documento cujo **ID do documento** seja exatamente o **UID** copiado, com os seguintes campos:
     - `role` *(string)*: `organizacao`
     - `email` *(string)*: o mesmo e-mail cadastrado no Authentication
     - `updatedAt` *(timestamp)*: data/hora atual

3. **Carregue o conteúdo inicial da Landing Page**:
   - Acesse `/login` na aplicação, selecione a aba **Organização** e entre com a conta criada acima.
   - No painel `/admin`, clique no botão **"Carregar conteúdo inicial"**.
   - O botão grava de forma idempotente todas as seções da landing page (hero, estatísticas, passos, cronograma, 5 critérios com pesos, jurados confirmados, regulamento, FAQ, parceiros e contato) sem duplicar documentos caso seja acionado novamente.

---

## Regras e Índices do Firestore (Plano Gratuito Spark)

Esta aplicação utiliza exclusivamente recursos gratuitos do Firebase (Authentication e Cloud Firestore). Os slides do pitch e screenshots são vinculados por URLs públicas (Google Drive, Canva, GitHub, Imgur), eliminando a necessidade de Cloud Storage ou Cloud Functions pagos.

Com a Firebase CLI (`npm install -g firebase-tools`) autenticada (`firebase login`), se desejar publicar índices manualmente:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### Testando as Security Rules (Emulador)

```bash
firebase emulators:exec --only firestore "npx vitest run firestore.rules.test.ts"
```

---

## Desenvolvimento Local

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build
```
