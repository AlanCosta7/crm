# Plano — Notas Ricas no Card (Markdown + Arquivos + Mídia)

> Alvo: aba **Notas** do card de negócio (`src/features/deals/DealSidebar.tsx`, `renderNotas`)
> Data: 31/08/2026 · Status: **aprovado — decisões do cliente na seção 7**

---

## 1. Situação atual

| Item | Como está hoje |
|---|---|
| Armazenamento | Nota = doc na coleção `tenants/{tid}/activities` com `type: 'note'` e campo `text` (string crua) |
| Escrita | `handleAddNote()` — `<textarea>` simples, sem edição e sem exclusão |
| Leitura | `activities.filter(a => a.dealId === deal.id && a.type === 'note')` — carrega **toda** a coleção `activities` do tenant no client |
| Render | `whiteSpace: 'pre-wrap'` — texto puro |
| Anexos | Não existem |
| Firebase Storage | **Não provisionado**: sem `storage.rules`, sem bloco `storage` no `firebase.json`, sem emulador. O bucket já está no `.env` (`wizmart-crm.firebasestorage.app`) e o `getStorage()` já é exportado em `src/config/firebase.ts`, mas nada usa |
| Mobile | App é responsivo (`@media` 768/1024) mas o painel do deal não tem tratamento de bottom sheet; sem PWA installable (só `pwaNotifications.ts`) |

**Ruído existente:** três lugares gravam `type: 'note'` automaticamente (`PipelinePage.tsx:489`, `DealSidebar.tsx:252/315`, `DashboardPage.tsx:809`) — atribuição de SDR, standby etc. Hoje esses eventos de sistema aparecem misturados às anotações humanas na aba Notas.

---

## 2. Decisões de arquitetura

### 2.1 Coleção dedicada `notes` (em vez de continuar em `activities`)

Nova coleção `tenants/{tid}/notes/{noteId}`, com camada de compatibilidade de leitura.

**Por quê:**
- `activities` é assinada **inteira** no client em várias telas. Notas com arrays de anexos inflariam todo esse payload.
- Rules de `activities` hoje só permitem `delete` para `master` — o requisito é o **autor** poder excluir.
- Separa anotação humana (editável, com anexos) de evento de sistema (imutável, alimenta KPIs/gamificação).
- Permite query filtrada `where('dealId','==',id)` + `orderBy('createdAt','desc')` em vez de varrer tudo.

**Compatibilidade:** as notas antigas (`activities` com `type:'note'`) continuam sendo renderizadas na mesma timeline, em modo somente-leitura, marcadas discretamente. Zero migração obrigatória; script opcional de backfill em `scripts/` se o cliente preferir unificar.

**Genérico por design:** o doc guarda `entityType: 'deal' | 'contact' | 'company'` + `entityId`, para reaproveitar a mesma feature em Contatos/Empresas depois sem refatorar.

### 2.2 Modelo de dados

```ts
// src/types/crm.ts
export type NoteEntityType = 'deal' | 'contact' | 'company';

export interface NoteAttachment {
  id: string;                 // nanoid gerado no client
  kind: 'image' | 'video' | 'audio' | 'document';
  name: string;               // nome original sanitizado, para exibição
  mime: string;
  size: number;               // bytes
  storagePath: string;        // tenants/{tid}/notes/{noteId}/{attId}/{safeName}
  url: string;                // downloadURL
  thumbPath?: string;         // miniatura (imagem/vídeo) gerada no client
  thumbUrl?: string;
  width?: number;             // imagem/vídeo
  height?: number;
  durationMs?: number;        // áudio/vídeo
  source: 'upload' | 'camera' | 'mic' | 'paste';  // telemetria de UX
  uploadedBy: string;         // uid
  uploadedAt: any;
}

export interface Note {
  id?: string;
  tenantId: string;
  entityType: NoteEntityType;
  entityId: string;
  dealId?: string;            // espelha entityId quando entityType==='deal' (query simples)
  productId: ProductId;
  authorId: string;
  body: string;               // markdown cru — fonte da verdade
  attachments: NoteAttachment[];
  mentions?: string[];        // uids mencionados no body (fase 6)
  pinned?: boolean;           // fase 6 (opcional)
  createdAt: any;
  updatedAt: any;
  editedAt?: any;             // preenchido só a partir da 1ª edição → badge "editada"
  editCount?: number;
}
```

Índice composto novo em `firestore.indexes.json`:
`notes` → `dealId ASC` + `createdAt DESC`.

### 2.3 Layout no Storage

```
tenants/{tenantId}/notes/{noteId}/{attachmentId}/{safeName}
tenants/{tenantId}/notes/{noteId}/{attachmentId}/thumb.webp
```

`noteId` é gerado no client **antes** do upload (`doc(collection(...)).id`), para que o rascunho já anexe arquivos no caminho definitivo — sem pasta temporária e sem mover objeto depois.

**Regras de Storage não conseguem ler o Firestore.** A autorização sai inteiramente dos custom claims que o projeto já emite (`token.tenantId`, `token.role`) + `customMetadata` do objeto:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isTenant(tid) { return request.auth != null && request.auth.token.tenantId == tid; }
    function isOperational(tid) {
      return isTenant(tid) && request.auth.token.role != 'viewer' && request.auth.token.role != 'design';
    }
    function isMaster(tid) { return isTenant(tid) && request.auth.token.role == 'master'; }

    match /tenants/{tid}/notes/{noteId}/{attId}/{fileName} {
      allow read: if isTenant(tid);                       // qualquer membro do tenant lê
      allow create: if isOperational(tid)
                    && request.resource.size < 100 * 1024 * 1024
                    && request.resource.metadata.ownerUid == request.auth.uid
                    && allowedType(request.resource.contentType);
      allow update: if false;                             // objeto é imutável; troca = novo attId
      allow delete: if isTenant(tid)
                    && (resource.metadata.ownerUid == request.auth.uid || isMaster(tid));
    }
  }
}
```

`allowedType()` — allowlist explícita: imagens (jpeg/png/webp/heic/gif), vídeo (mp4/quicktime/webm), áudio (mp4/aac/mpeg/webm/ogg/wav), PDF, Office (doc/docx/xls/xlsx/ppt/pptx), csv, txt, zip.
**Bloqueados:** `image/svg+xml` e `text/html` — servidos inline pelo Storage viram XSS no domínio do bucket.
Todo arquivo não-imagem sobe com `contentDisposition: 'attachment; filename="..."'` no metadata, para nunca renderizar inline.

Limites por tipo, validados no client **e** nas rules: imagem 15 MB · áudio 25 MB · documento 25 MB · vídeo 100 MB.

### 2.4 Rules de Firestore da coleção `notes`

```
match /notes/{noteId} {
  // Viewer e design LEEM (decisão 1) — anexos inclusive
  allow read:   if isAnyRole(tid) && canAccessDocProduct(resource.data);

  allow create: if isOperational(tid)
                   && request.resource.data.authorId == request.auth.uid
                   && requestProductAllowed();

  // Só o autor edita o corpo/anexos; authorId e createdAt são imutáveis
  allow update: if isOperational(tid)
                   && resource.data.authorId == request.auth.uid
                   && request.resource.data.authorId == resource.data.authorId
                   && requestProductAllowed();

  // Autor exclui a sua; master exclui qualquer uma (decisão 2 — moderação)
  allow delete: if (isOperational(tid) && resource.data.authorId == request.auth.uid)
                   || isMaster(tid);
}
```

A rule de Storage já concede `read` a qualquer membro do tenant (inclui viewer) e `delete` ao dono do objeto **ou** ao master — as duas decisões ficam coerentes nas duas camadas.

### 2.5 Espelho no feed de Atividades (decisão 3)

O feed geral (`ActivitiesPage`) e os KPIs leem `activities`. Como as notas passam a morar em `notes`, uma Cloud Function `onNoteCreated` grava um **espelho enxuto** em `activities`:

```ts
{ type: 'note', dealId, productId, userId: authorId, status: 'completed',
  text: plainText(body).slice(0, 280),   // markdown convertido a texto puro
  noteId,                                 // link de volta para a nota completa
  attachmentCount: 3,                     // só a contagem — nenhum anexo no feed
  coinsAwarded: 0, wasOnTime: true }
```

- **Sem anexos no feed**, conforme decidido: só o texto truncado e um selo "3 anexos" que leva ao card.
- Editar a nota atualiza o espelho; excluir a nota remove o espelho (mesma trigger).
- **TV:** `functions/src/tv/tvHelper.ts:126` conta como "tarefa do dia" toda activity do dia — hoje isso inclui notas. Adicionar `a.type !== 'note'` ao filtro. Efeito colateral esperado e desejável: o total de tarefas da TV deixa de inflar com notas (inclusive as automáticas de sistema, que nunca deveriam contar).

### 2.6 Exclusão sem órfãos

Excluir anexo (autor): remove do array no Firestore → `deleteObject()` no Storage (+ thumb).
Excluir nota inteira (autor ou master): apaga o doc; uma Cloud Function `onDocumentDeleted('tenants/{tid}/notes/{noteId}')` varre e apaga o prefixo inteiro no Storage. Isso cobre falha parcial do client e exclusão via console.
Extra: função agendada semanal (`janitorNoteAttachments`) que lista prefixos sem doc correspondente e limpa — rede de segurança contra upload abandonado (usuário anexa e fecha o card sem salvar).

---

## 3. Experiência do usuário

### 3.1 Composer (escrever / editar)

Um só componente, usado tanto para nota nova quanto para edição inline (`NoteComposer`).

```
┌──────────────────────────────────────────────┐
│ [Escrever] [Visualizar]          B I " • ≡ 🔗 │  ← abas + toolbar markdown
├──────────────────────────────────────────────┤
│ textarea autosize, markdown, drag&drop,      │
│ colar print do clipboard                     │
├──────────────────────────────────────────────┤
│ [📎 anexo] [📷 foto] [🎥 vídeo] [🎙️ áudio]     │
│ ┌────┐ ┌────┐ ┌──────────────┐               │  ← chips de anexo com progresso
│ │img │ │pdf │ │ 🎙 0:14  ▶ ✕ │               │
│ └────┘ └────┘ └──────────────┘               │
│                       [Cancelar] [Salvar]    │
└──────────────────────────────────────────────┘
```

- **Markdown**: negrito, itálico, riscado, títulos, listas, checklist `- [ ]`, citação, link, código, tabela (GFM). Atalhos `Ctrl/⌘+B`, `+I`, `+K` (link com texto selecionado). No mobile a toolbar vira uma barra horizontal rolável ancorada acima do teclado.
- **Preview**: aba "Visualizar" (padrão GitHub) — mais previsível no mobile que split-view.
- **Colar imagem** (`onPaste`): print da tela vira anexo direto. Provavelmente o gesto mais usado por BDR/SDR no desktop.
- **Drag & drop** com overlay "Solte para anexar" (desktop).
- **Upload otimista**: o arquivo começa a subir assim que é escolhido, com barra de progresso no chip e botão cancelar. O botão "Salvar" fica desabilitado enquanto houver upload em curso (com aviso "enviando 2 arquivos…").
- **Guarda de rascunho**: rascunho (texto + anexos já enviados) fica em `localStorage` por `dealId`, restaurado ao reabrir; confirmação antes de descartar anexos já enviados.

### 3.2 Captura nativa (mobile e desktop)

| Ação | Implementação | Justificativa |
|---|---|---|
| 📷 **Foto** | `<input type="file" accept="image/*" capture="environment">` | Abre a câmera nativa do Android/iOS — foco, HDR, flash, qualidade muito superior a um `getUserMedia` caseiro. No desktop, o mesmo input abre o seletor de arquivos |
| 🎥 **Vídeo** | `<input type="file" accept="video/*" capture="environment">` | Idem — no iOS usa o app Câmera, sem esbarrar em limitações de MediaRecorder do Safari |
| 🎙️ **Áudio** | **Gravador in-app** (`getUserMedia` + `MediaRecorder`) | Não há input `capture` confiável para áudio no iOS. Gravador próprio dá timer, waveform ao vivo, pausar/retomar, descartar e reouvir antes de enviar |
| 📎 **Arquivo** | `<input type="file" multiple>` sem `capture` | No iOS o próprio menu já oferece "Fototeca / Tirar foto / Escolher arquivo"; no Android abre o seletor do sistema |

**Detalhes do gravador de áudio (o ponto mais sensível entre plataformas):**
- Escolha de container por `MediaRecorder.isTypeSupported()`: `audio/webm;codecs=opus` (Chrome/Android) → `audio/mp4` (Safari iOS/macOS) → fallback `''` (default do browser). O `mime` real vai salvo no anexo, para o `<audio>` reproduzir corretamente.
- Requer HTTPS (Hosting já atende) e gesto do usuário.
- Tratar `NotAllowedError` (permissão negada) e `NotFoundError` (sem microfone) com mensagem clara e link para as instruções de permissão do navegador — em vez do erro genérico.
- iOS interrompe a captura quando o app vai para segundo plano: parar a gravação em `visibilitychange` e preservar o que já foi gravado, nunca perder o áudio.
- Limite de 5 minutos por gravação com aviso aos 4:30.

### 3.3 Otimizações client-side (economia e velocidade no 4G)

- **Imagem**: redimensiona para no máximo 2000px no maior lado e reencoda em WebP q=0.82 via canvas antes de subir (mantém o original só se já for menor). HEIC do iPhone é convertido pelo canvas automaticamente — resolve o problema de `.heic` que o Chrome não exibe.
- **Miniatura**: gera thumb 400px WebP no client e sobe junto. Evita Cloud Function de thumbnails (custo e latência) e deixa a timeline leve.
- **Vídeo**: sem transcodificação (inviável no client). Gera **poster** capturando o frame ~1s via `<video>` + canvas e sobe como thumb. Avisa quando o arquivo passa de 50 MB.

### 3.4 Timeline (leitura)

- Markdown renderizado; links abrem em nova aba com `rel="noopener noreferrer"`; checklists interativas apenas para o autor (marcar/desmarcar salva o body).
- **Imagens/vídeos**: grid de miniaturas (1 grande / 2-4 em mosaico), clique abre lightbox com navegação por teclado e swipe no mobile.
- **Áudio**: player inline compacto com duração e velocidade 1x/1.5x/2x.
- **Documentos**: card com ícone por extensão, nome, tamanho e ações Abrir / Baixar.
- **Cabeçalho da nota**: avatar + nome do autor + data relativa ("há 2 h", tooltip com data completa) + badge "editada" quando `editedAt` existe.
- **Ações** (menu `⋯`, visível só para o autor; master vê "Excluir"): Editar · Copiar link da nota · Excluir (com confirmação, e aviso de quantos anexos serão apagados junto).
- Notas legadas (vindas de `activities`) aparecem na mesma linha do tempo, sem ações de edição.
- Paginação: mostra as 20 mais recentes com "Carregar mais".

### 3.5 Menções `@pessoa` (decisão 5 — incluída no escopo)

**Autocomplete:** digitar `@` no composer abre um popover com os membros do tenant, filtrando por nome enquanto digita. Fonte: a coleção `sellers` já assinada pelo card (`seller.id === uid` — confirmado no seed), cruzada com `users` para excluir inativos. Navegação por ↑ ↓ Enter Esc; no mobile o popover vira lista acima do teclado. Avatar + nome + papel em cada linha.

**Formato no corpo** — link markdown com esquema próprio, que preserva o `uid` mesmo se a pessoa mudar de nome:

```
Falei com o cliente, [@Carla Rep](wm:user/rep-001) pode assumir a partir daqui.
```

O `rehype-sanitize` recebe um schema estendido que permite **apenas** o protocolo `wm:` em `href`, e o renderer customizado converte esse link num **chip** (`<span>`, nunca `<a href>`) que abre o perfil/filtro da pessoa. Nenhum protocolo novo escapa para o DOM.

Além do markdown, os uids vão desnormalizados em `note.mentions: string[]` — a function não precisa reparsear o corpo e a query "notas onde fui mencionado" fica trivial.

**Notificação** — encaixa na infra que já existe (`tenants/{tid}/notifications`, criada só por Cloud Function, exibida no `NotificationsBell`):

- Trigger `onNoteWritten` (create + update) compara `mentions` antes/depois e notifica **apenas os uids novos** — reeditar a nota não re-notifica quem já foi avisado.
- Autor nunca notifica a si mesmo; quem não tem acesso ao produto do deal é filtrado.
- Doc criado: `{ type: 'note_mention', title: 'Você foi mencionado', body: '<Autor> em <Nome do deal>: <trecho>', dealId, sourceId: noteId, read: false }`.
- `AppNotification.type` já é `'lead_received' | string` — basta adicionar o ícone de `note_mention` no `NotificationsBell.tsx:132`.
- Notificação nativa do browser reaproveitando `pwaNotifications.send()` quando a permissão já estiver concedida.

**Menção não concede acesso:** se o mencionado não puder ver aquele deal pelas rules, ele recebe a notificação sem link clicável — nada de vazar dado por menção.

### 3.6 Mobile

- Composer vira **bottom sheet** em `max-width: 768px`, ancorado ao teclado (`env(safe-area-inset-bottom)` + `visualViewport` para não ser coberto pelo teclado do iOS).
- Alvos de toque ≥ 44px; toolbar de markdown rolável horizontalmente.
- Lightbox com swipe e pinch-to-zoom.
- Upload em rede lenta: progresso por arquivo + retomada (`uploadBytesResumable` já retoma sozinho após queda breve).
- Testado em Safari iOS e Chrome Android reais — HEIC, `capture`, MediaRecorder e teclado são exatamente onde o comportamento diverge.

---

## 4. Bibliotecas

| Uso | Escolha | Peso (gz) | Motivo |
|---|---|---|---|
| Render markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` | ~45 KB | GFM (tabelas, checklist) e sanitização em árvore — não em string, sem `dangerouslySetInnerHTML` |
| ID de anexo | `nanoid` | ~1 KB | (ou `crypto.randomUUID()` nativo — dispensa a dep) |

Tudo carregado por `React.lazy` / import dinâmico **apenas na aba Notas**, para não pesar o bundle inicial do Kanban.

**Descartado:** editores WYSIWYG (TipTap, Lexical, Quill) — 100–250 KB, problemas conhecidos com teclado do iOS, e markdown cru é mais fácil de versionar, buscar e exportar. Textarea + toolbar + preview entrega 95% do valor por 10% do custo.

---

## 5. Fases de entrega

Cada fase é entregável e testável isoladamente.

### Fase 0 — Infraestrutura ✅ concluída (31/08/2026)
1. ⏳ **Pendente com o Alan:** provisionar o Storage no console (`wizmart-crm` e homolog, `southamerica-east1`) — §8.
2. ✅ `storage.rules` criado e registrado em `firebase.json` + `firebase.emutest.json`; emulador de storage nas portas 9199 (dev) e 9198 (testes).
3. ✅ `connectStorageEmulator` em `src/config/firebase.ts` sob `import.meta.env.DEV`.
4. ✅ CORS pronto em `scripts/config/storage-cors.json` — aplicar quando o bucket existir:
   `gcloud storage buckets update gs://wizmart-crm.firebasestorage.app --cors-file=scripts/config/storage-cors.json`
5. ✅ Tipos `Note` / `NoteAttachment` / `NoteAttachmentKind` em `src/types/crm.ts`; `AppNotification.type` ganhou `'note_mention'`.
6. ✅ Rules de Firestore da coleção `notes` + 2 índices compostos (`dealId+createdAt`, `entityType+entityId+createdAt`).
7. ✅ **29 testes de Security Rules** (`tests/rules/notes.rules.test.ts`) rodando contra os emuladores via `npm run test:rules` — cobrem as decisões 1 e 2, a allowlist de tipos, o `ownerUid` no metadata e o bloqueio de SVG.

### Fase 1 — Markdown, edição e exclusão ✅ concluída (31/08/2026)
- ✅ `src/features/deals/notes/` — `NotesTab`, `NoteComposer`, `NoteItem`, `MarkdownView`, `MarkdownToolbar`, `useNotes`, mais os módulos puros `markdownEdit`, `markdownSanitize`, `noteFeed` e `rehypeChecklistIndex`.
- ✅ `useNotes(dealId)` assina `notes` filtrada por `dealId` e mescla as notas legadas de `activities` (o card já as tinha em mãos — sem segunda assinatura). Query só com `where`, sem `orderBy`: não depende dos índices compostos terem sido deployados.
- ✅ Criar / editar inline / excluir, selo "editada", checklist clicável pelo autor, rascunho por card em `localStorage`, atalhos `Ctrl+B/I/K` e `Ctrl+Enter`, colar URL sobre texto selecionado vira link.
- ✅ `renderNotas()` do `DealSidebar.tsx` virou 10 linhas com `<NotesTab />` em `lazy` + `Suspense`; o textarea antigo e o `handleAddNote` saíram.
- ✅ **Bundle:** chunk `markdown` separado no `vite.config.ts` (166 kB / 50 kB gz) baixado só ao abrir a aba — o `vendor` inicial não mudou de tamanho.
- ✅ **90 testes** no diretório: sanitização (script, iframe, `javascript:`, img externa), utilitários da toolbar, merge com legado, permissões, composer e item.

**Decisão registrada:** imagem por URL externa (`![](http…)`) fica fora do markdown — vazaria o IP de quem abre o card para um terceiro. Imagem entra como anexo, na Fase 3.

### Fase 2 — Anexos de documento ✅ concluída (31/08/2026)
- ✅ `useAttachmentUpload()` — `uploadBytesResumable` com progresso por arquivo, cancelamento, `customMetadata.ownerUid` (é o que as rules usam para autorizar a exclusão) e `contentDisposition: attachment` nos documentos.
- ✅ Botão 📎, drag & drop com overlay, colar arquivo do clipboard, validação de tipo/tamanho com mensagem específica, chips com barra de progresso.
- ✅ Cards de documento na timeline (ícone por extensão, tamanho, abrir/baixar); autor exclui anexo com confirmação.
- ✅ **Rascunho carrega os anexos:** o `noteId` é decidido no composer, antes do primeiro upload, e vai junto no rascunho do `localStorage` — retomar um rascunho reaproveita os arquivos já enviados em vez de deixá-los órfãos.
- ✅ Cloud Function `onNoteDeleted` — apaga o espelho no feed e varre o prefixo inteiro no Storage (`deleteFiles({ prefix })`, não a lista de anexos: pega também o arquivo que subiu e nunca foi referenciado).
- ✅ Cloud Function `onNoteWritten` — espelho enxuto no feed de Atividades (§2.5), criado, atualizado e removido junto com a nota.
- ✅ `tvHelper.ts` deixou de contar notas como tarefa do dia.
- ✅ **32 testes de rules** (3 novos amarram o caminho e os limites do client às rules — mudar um lado só quebra o teste) e **118 testes** no diretório de notas, mais 7 no resumo do espelho, dentro das functions.

### Fase 3 — Imagem e vídeo ✅ concluída (31/08/2026)
- ✅ `mediaProcess.ts` — imagem redimensionada para 2000px e reencodada em WebP (q=0.82) + miniatura de 400px; vídeo ganha poster capturado por volta de 1s; áudio tem a duração medida. Tudo best-effort: falha de decodificação sobe o original sem miniatura, nunca bloqueia o anexo.
- ✅ HEIC do iPhone é reencodado (e por isso passa a abrir no Chrome e no Android); quando o reencode não compensa, o original é mantido.
- ✅ Miniatura sobe como segundo objeto no mesmo prefixo e é apagada junto com o anexo — sem Cloud Function de thumbnail.
- ✅ `MediaGrid` (mosaico, proporção real para não pular o layout, `loading="lazy"`, duração no vídeo), `Lightbox` (teclado, swipe, trava o scroll do fundo, player nativo para vídeo) e `AudioPlayer` (controles próprios, 1x/1.5x/2x).
- ✅ Colar arquivo do clipboard direto na textarea; o seletor passou a aceitar mídia além de documento.
- ✅ **35 testes novos** (mediaProcess, MediaGrid, AudioPlayer e a integração dos três tipos numa nota só) — 155 no diretório.

**Achado de performance:** digitar no composer custava ~165 ms por tecla, porque a toolbar (10 ícones) re-renderizava a cada caractere. Estabilizar `apply`/`selection` com um ref e memoizar a `MarkdownToolbar` derrubou para ~40 ms; a gravação do rascunho passou a ser adiada em 400 ms (com flush na saída, para não perder texto ao fechar o painel).

### Fase 4 — Captura in-app ✅ concluída (31/08/2026)
- ✅ Botões **Foto** e **Vídeo** com `<input capture="environment">` — abrem o app de câmera nativo. Aparecem só em aparelho de toque (`pointer: coarse`): no desktop o `capture` é ignorado e o botão "Anexar" já faz o mesmo.
- ✅ `AudioRecorder` — negociação de container (`audio/webm;codecs=opus` no Chrome/Android, `audio/mp4` no Safari, que não grava WebM), timer com aviso 30 s antes do teto de 5 min, medidor de nível, pausar/continuar, ouvir antes de anexar e regravar.
- ✅ **Interrupção no iOS:** `visibilitychange` encerra a gravação preservando o que já foi capturado, em vez de perder o áudio quando o app sai de foco.
- ✅ Trilhas do microfone sempre encerradas — senão o indicador de gravação do sistema fica aceso depois de concluir.
- ✅ Erros separados por causa: permissão negada, sem microfone, microfone ocupado, navegador sem suporte (com orientação de anexar arquivo).
- ✅ A origem do anexo (`camera`, `mic`, `paste`, `upload`) é gravada no metadado.
- ✅ **23 testes novos** — a negociação de MIME por navegador e o fluxo completo do gravador com `MediaRecorder` simulado (incluindo o corte do iOS e os três erros de permissão). 178 no diretório.

### Fase 5 — Menções `@pessoa` ✅ concluída (31/08/2026)
- ✅ Autocomplete ao digitar `@`: busca por qualquer palavra do nome, ignora acento e caixa, navega por ↑ ↓ Enter Tab Esc e é tocável no celular. Não sugere o próprio autor nem quem já foi mencionado, e não abre no meio de um e-mail (`contato@empresa.com`).
- ✅ Serialização `[@Nome](wm:user/uid)` — o uid sobrevive a troca de nome. O chip é `<span>`, nunca `<a>`: o esquema `wm:` não tem caminho para o DOM.
- ✅ `note.mentions` desnormalizado a partir do corpo, na criação e na edição.
- ✅ `onNoteWritten` notifica **apenas quem passou a ser mencionado** (diff antes/depois): reeditar não avisa de novo. Autor nunca notifica a si mesmo; uid inativo ou inexistente é descartado.
- ✅ **Menção não concede acesso:** quem não tem o produto do deal no escopo recebe a notificação sem `dealId` e sem o nome do negócio no corpo — o aviso chega, o link não.
- ✅ `NotificationsBell` com ícone `AtSign`, e clique em menção abre `/lead/:dealId` direto (o feed do pipeline não mostraria a nota que motivou o aviso).
- ✅ **47 testes novos** (32 no módulo de menções, 9 no render/composer, 11 nas regras de destinatário dentro das functions) — 225 no diretório de notas.

**Descoberta:** o `react-markdown` tem uma higienização de URL própria (`urlTransform`), independente do `rehype-sanitize`, que zerava o `wm:` das menções. Foi preciso liberar só esse esquema e manter `defaultUrlTransform` para todo o resto — as duas barreiras contra `javascript:` seguem de pé.

### Fase 6 — Polimento mobile + QA ✅ concluída (31/08/2026)
- ✅ No celular o composer vira faixa fixa acima do teclado enquanto está em foco, com backdrop para dispensar. `useKeyboardInset` publica a altura real do teclado em `--kb` a partir do `visualViewport` — no iOS o teclado é desenhado por cima e `100vh` continua valendo a tela toda, então elemento fixo no rodapé ficaria escondido.
- ✅ Safe areas (`env(safe-area-inset-bottom)`) e alvos de toque de 38–44 px em toda a aba.
- ✅ `janitorNoteAttachments` — varredura semanal (domingo, 4h BRT) por prefixo. **Só apaga arquivo sem nota com mais de 48h**: abaixo disso pode ser rascunho que alguém ainda está escrevendo. Teto de 500 prefixos por execução, com aviso no log quando sobra trabalho.
- ✅ **11 testes E2E** no Playwright (`tests/notes-rich.spec.ts`) contra os emuladores: markdown, toolbar, checklist, edição com selo, exclusão, upload de PDF, recusa de SVG, remoção de anexo, viewer sem editor, menção virando chip e a ancoragem no viewport de iPhone.
- ✅ Checklist de QA manual em `QA/CHECKLIST_NOTAS_RICAS.md` — cobre só o que máquina nenhuma prova (câmera real, HEIC entre plataformas, corte de gravação no iOS, teclado nativo, rede ruim).
- ✅ **13 testes novos** de unidade (7 do inset de teclado, 6 do janitor) — 232 no diretório de notas.

**Total estimado: 8,5 dias úteis.** Fases 1 e 2 já entregam a maior parte do valor percebido.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| XSS via markdown ou SVG anexado | `rehype-sanitize` com schema restrito; SVG e HTML fora da allowlist; `contentDisposition: attachment` em não-imagens |
| Arquivos órfãos no Storage | Trigger `onDocumentDeleted` + janitor agendado + `noteId` definido antes do upload |
| Custo de Storage crescendo sem controle | Compressão client-side, limites por arquivo, painel de consumo por tenant, política de retenção a definir com o cliente |
| MediaRecorder divergente no iOS | Negociação de mime, teste em device real, fallback para `input capture` se o gravador falhar |
| `activities` já é pesada no client | A feature nova **não** aumenta esse payload (coleção separada e filtrada) — e abre caminho para depois filtrar `activities` por deal |
| Menção vazando dado de deal restrito | Notificação enviada sem link quando o mencionado não passa nas rules do deal; o corpo da notificação leva só o trecho, nunca dados do deal |
| Espelho no feed dessincronizado da nota | Mesma trigger cobre create/update/delete; o feed sempre exibe o texto do espelho e linka para a nota como fonte da verdade |
| Regressão no `DealSidebar.tsx` (1.332 linhas) | Feature em pasta própria; o sidebar só ganha uma linha de composição |

---

## 7. Decisões do cliente (31/08/2026)

| # | Questão | Decisão | Onde impacta |
|---|---|---|---|
| 1 | Viewer vê anexos? | **Sim** — leitura completa, sem anexar | `allow read: if isAnyRole(tid)` no Firestore; `allow read: if isTenant(tid)` no Storage; composer oculto para viewer |
| 2 | Master exclui nota de terceiros? | **Sim** — moderação; autor sempre exclui a sua | `allow delete` nas duas camadas (§2.4) |
| 3 | Notas no feed e na TV? | **Sim no feed, sem anexos. Não na TV** | Espelho enxuto via `onNoteCreated` + filtro `type !== 'note'` no `tvHelper.ts` (§2.5) |
| 4 | Quota/retenção por tenant? | **Não** — sem limite por tenant | Mantidos só os limites por arquivo (15/25/25/100 MB) e a compressão client-side |
| 5 | Menções `@pessoa`? | **Incluir** | Nova Fase 5 (§3.5) — +1 dia no escopo |

---

## 8. Estado final

Todas as 7 fases estão implementadas. Storage provisionado pelo Alan em 31/08/2026.

**Cobertura automatizada:** 232 testes de unidade/componente na feature (893 no app), 32 de Security Rules contra os emuladores, 123 nas Cloud Functions e 11 E2E no Playwright.

**Falta para o go-live** — nesta ordem:

```bash
# 1. rules e índices
firebase deploy --only firestore:rules,firestore:indexes,storage --project wizmart-crm

# 2. funções da feature
firebase deploy --only functions:onNoteWritten,functions:onNoteDeleted,functions:janitorNoteAttachments --project wizmart-crm

# 3. CORS do bucket (uma vez só)
gcloud storage buckets update gs://wizmart-crm.firebasestorage.app --cors-file=scripts/config/storage-cors.json
```

4. Rodar `QA/CHECKLIST_NOTAS_RICAS.md` em iPhone e Android físicos — é onde câmera, microfone, HEIC e teclado nativo saem do simulado.
