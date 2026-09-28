# QA manual — Notas ricas do card

> Complementa os testes automatizados. Aqui está **só o que máquina nenhuma
> prova**: câmera real, microfone real, teclado nativo e arquivos que só
> existem em aparelho de verdade.
>
> Automatizado já está coberto: 232 testes de unidade/componente, 32 de
> Security Rules contra os emuladores e 11 E2E no Playwright.

## Como rodar o que é automatizado

```bash
npm test -- --run          # unidade e componentes
npm run test:rules         # Security Rules (Firestore + Storage) nos emuladores
npm run test:e2e:local     # E2E completo: sobe emuladores, semeia e roda o Playwright
```

O `test:e2e:local` sobe **auth, firestore, functions, database e storage**. Se
você já tiver emuladores rodando de antes desta feature, derrube-os primeiro —
os antigos não têm o Storage e o upload falha.

---

## 1. iPhone (Safari) — o mais importante

Rode em aparelho físico, não no simulador: câmera, HEIC e o corte de gravação
em segundo plano não se reproduzem lá.

- [ ] **Foto pela câmera** — botão "Foto" abre o app Câmera nativo; a foto
      aparece na nota e abre no visualizador
- [ ] **A mesma foto abre no Chrome/Android** — é o teste do HEIC: o arquivo é
      reencodado em WebP no envio; se abrir só no iPhone, o reencode falhou
- [ ] **Foto da Fototeca** pelo botão "Anexar"
- [ ] **Vídeo pela câmera** — capa (poster) e duração aparecem na miniatura
- [ ] **Gravar áudio** — permissão pedida uma vez, contador andando, medidor de
      nível se mexendo
- [ ] **Pausar e continuar** a gravação; o contador não pula
- [ ] **Ouvir antes de anexar** e depois "Regravar"
- [ ] **Sair do app no meio da gravação** (home ou trocar de app) — ao voltar, o
      que já foi gravado está na tela de revisão, não perdido
- [ ] **Negar a permissão de microfone** — mensagem explica como liberar
- [ ] **Indicador de gravação do sistema apaga** depois de concluir
- [ ] **Teclado** — ao tocar no campo, o composer sobe junto e continua visível;
      os botões de anexo ficam alcançáveis
- [ ] **Área segura** — nada fica atrás da barra inferior do iPhone
- [ ] **Visualizador** — swipe troca de imagem, pinça dá zoom, fundo não rola

## 2. Android (Chrome)

- [ ] Foto e vídeo pela câmera nativa
- [ ] Gravação de áudio (aqui o container é WebM/Opus — confirme que o áudio
      gravado no Android **toca no iPhone** e vice-versa)
- [ ] Teclado não cobre o composer
- [ ] Anexar arquivo do Google Drive pelo seletor do sistema

## 3. Arquivos reais

- [ ] PDF de ~10 MB — barra de progresso anda, download funciona
- [ ] Planilha .xlsx e apresentação .pptx — ícone e extensão corretos
- [ ] Foto de 12 MP — confirme no console do Storage que subiu em centenas de
      KB, não em megabytes (é o pipeline de compressão funcionando)
- [ ] Vídeo de ~80 MB — sobe; acima de 100 MB é recusado com mensagem clara
- [ ] Arquivo com nome esquisito (acento, emoji, `../`) — sobe e o nome exibido
      continua legível

## 4. Permissões (com dois logins lado a lado)

- [ ] **Viewer** vê notas e baixa anexos, mas não tem editor
- [ ] **Outro SDR** não vê "Editar" nem "Excluir" na nota alheia
- [ ] **Master** vê "Excluir" na nota alheia, mas **não** "Editar"
- [ ] Excluir a nota apaga os anexos junto (confira no console do Storage)

## 5. Menções

- [ ] `@` abre a lista; escolher insere o chip
- [ ] O mencionado recebe a notificação no sino e o clique abre o card
- [ ] **Editar a nota sem mexer nas menções não notifica de novo**
- [ ] Mencionar alguém sem acesso ao produto do deal: a notificação chega, mas
      sem link

## 6. Integração com o resto do CRM

- [ ] A nota aparece no feed geral de **Atividades**, com o texto resumido e
      **sem** os anexos
- [ ] Editar a nota atualiza o resumo no feed
- [ ] Excluir a nota some do feed
- [ ] **TV**: o total de "tarefas do dia" não conta notas (esperado: o número
      cai um pouco em relação ao que era antes desta entrega)

## 7. Rede ruim

- [ ] Com o 4G fraco (ou throttling no DevTools): a barra de progresso anda, e
      um upload interrompido retoma sozinho
- [ ] Cancelar um upload em andamento não deixa arquivo no Storage
- [ ] Escrever, fechar o card sem salvar e voltar: o rascunho volta **com os
      anexos** já enviados

---

## Antes do go-live

```bash
# rules e índices
firebase deploy --only firestore:rules,firestore:indexes,storage --project wizmart-crm

# funções da feature
firebase deploy --only functions:onNoteWritten,functions:onNoteDeleted,functions:janitorNoteAttachments --project wizmart-crm

# CORS do bucket (uma vez)
gcloud storage buckets update gs://wizmart-crm.firebasestorage.app --cors-file=scripts/config/storage-cors.json
```

O `janitorNoteAttachments` roda aos domingos às 4h e só apaga arquivo sem nota
com **mais de 48h** — a janela existe para não arrancar o anexo de um rascunho
que alguém ainda está escrevendo.
