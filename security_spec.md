# Especificação de Segurança — Plataforma Hackathon CC IFPR

## 1. Invariantes de Dados
1. **Papéis (RBAC)**: Apenas `userRoles/{uid}` define o papel do usuário. No cadastro público, o usuário só pode criar seu próprio `userRoles/{uid}` com `role == "participante"`. Apenas a Organização altera papéis.
2. **Verificação de E-mail e Domínio**: Apenas e-mails `@ifpr.edu.br` ou `@estudantes.ifpr.edu.br` são aceitos para participantes no cadastro. Nenhuma escrita em dados de equipe, integrantes, locks ou projeto é permitida sem `request.auth.token.email_verified == true`.
3. **Isolamento de Equipes e Projetos**: O líder de uma equipe (`leaderUid == request.auth.uid`) lê e edita apenas os dados de sua própria equipe (`teams/{teamId}`), seus integrantes (`members`) e seu projeto (`projects/{teamId}`). Equipe A nunca acessa dados da Equipe B.
4. **Integridade da Máquina de Estados**: O cliente participante só pode transicionar `status` de `"rascunho"` para `"enviado"` uma única vez, com `submittedAt == request.time`, antes do prazo e com todos os campos obrigatórios válidos validados pelas Security Rules. Após enviado, nenhuma edição é permitida pelo cliente, e apenas a Organização altera para `"avaliado"` ou `"encerrado"`.
5. **Bloqueio por Prazo**: Após `settings/event.submissionDeadline`, nenhuma mutação de equipe, integrante ou projeto em rascunho é aceita pelas Security Rules.
6. **Unicidade de Integrante**: `memberLocks/{normalizedEmail}` só pode ser criado se o documento ainda não existir e atomicamente com a equipe do líder autenticado.
7. **Isolamento de Avaliações e Resultados**: Jurados só leem projetos com `status == "enviado"` e só leem/escrevem suas próprias avaliações (`evalId == projectId + "_" + request.auth.uid`) enquanto `settings/event.evaluationOpen == true`. Jurados não leem avaliações de outros jurados nem `results`. Participantes só leem `results/{teamId}` quando `settings/event.gradesReleased == true` e o projeto está `"avaliado"`.
8. **Escrita Exclusiva do Servidor**: `results/{projectId}` bloqueia toda escrita via SDK cliente (`allow write: if false`).

## 2. Payloads Adversariais ("Dirty Dozen")
1. **Auto-promoção de Role**: Participante tenta criar `userRoles/{uid}` com `role: "organizacao"`. -> `PERMISSION_DENIED`.
2. **Escrita sem E-mail Verificado**: Participante com `email_verified: false` tenta criar `teams/{uid}`. -> `PERMISSION_DENIED`.
3. **E-mail Não Institucional**: Usuário com `@gmail.com` tenta se auto-registrar como participante e criar equipe. -> `PERMISSION_DENIED`.
4. **Leitura Cruzada de Equipe**: Líder da equipe A tenta ler `teams/{teamB}` ou `projects/{teamB}`. -> `PERMISSION_DENIED`.
5. **Bypass de Status do Projeto**: Líder tenta atualizar `projects/{teamA}` mudando `status` para `"avaliado"` pelo cliente ou enviar sem slides/repositório válidos. -> `PERMISSION_DENIED`.
6. **Edição Após o Prazo**: Líder tenta atualizar `projects/{teamA}` com `request.time > submissionDeadline`. -> `PERMISSION_DENIED`.
7. **Shadow Field (Campo Fantasma)**: Líder tenta incluir campo não permitido `isWinner: true` em `projects/{teamA}`. -> `PERMISSION_DENIED`.
8. **Member Lock Duplicado**: Líder B tenta sobrescrever `memberLocks/{email}` já pertencente à Equipe A. -> `PERMISSION_DENIED`.
9. **Jurado Lendo Rascunho**: Jurado tenta ler `projects/{teamA}` quando `status == "rascunho"`. -> `PERMISSION_DENIED`.
10. **Jurado Lendo Avaliação Alheia**: Jurado 1 tenta ler `evaluations/{projectA_juror2}`. -> `PERMISSION_DENIED`.
11. **Jurado Avaliando com Avaliação Fechada ou Nota Inválida**: Jurado tenta enviar nota `105` (fora de 0..100) ou quando `evaluationOpen == false`. -> `PERMISSION_DENIED`.
12. **Cliente Escrevendo em Results**: Participante ou jurado tenta escrever em `results/{teamA}`. -> `PERMISSION_DENIED`.

## 3. Suite de Testes
Ver `firestore.rules.test.ts` na raiz do projeto (executado via Firebase Emulator Suite + Vitest).
