/**
 * Editor de nota — o mesmo componente serve para escrever uma nota nova e para
 * editar uma existente (`initialBody` + `mode="edit"`).
 *
 * Decisões de UX:
 *  - textarea + toolbar + aba "Visualizar", no lugar de um WYSIWYG: markdown
 *    cru é mais fácil de versionar e não briga com o teclado do iOS
 *  - o rascunho da nota NOVA (texto + anexos já enviados) fica em
 *    localStorage por card, para não perder trabalho ao fechar o painel sem
 *    querer; edição não salva rascunho
 *  - o `noteId` é decidido aqui, antes do primeiro upload, e vem junto no
 *    rascunho — assim os anexos de um rascunho retomado continuam apontando
 *    para o mesmo lugar no Storage, sem virar órfão
 *  - Ctrl/⌘+B, +I, +K e Ctrl/⌘+Enter para salvar
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { MarkdownToolbar } from './MarkdownToolbar';
import { MarkdownView } from './MarkdownView';
import { AttachmentChip } from './AttachmentChip';
import { CaptureButtons } from './CaptureButtons';
import { AudioRecorder } from './AudioRecorder';
import { MentionPopover } from './MentionPopover';
import { useAttachmentUpload } from './useAttachmentUpload';
import { DOCUMENT_ACCEPT, MEDIA_ACCEPT } from './attachments';
import { isRecordingSupported, isTouchDevice } from './audioRecording';
import {
  extractMentions,
  filterMentionCandidates,
  findMentionQuery,
  insertMention,
  type MentionCandidate,
} from './mentions';
import { toggleWrap, insertLink, type EditResult, type Selection } from './markdownEdit';
import type { NoteAttachment, NoteAttachmentSource, Seller } from '../../../types/crm';

interface NoteComposerProps {
  mode?: 'create' | 'edit';
  /** Modo edit: id real da nota. Modo create: ignorado — veja `makeNoteId` */
  noteId?: string;
  /** Modo create: gera o id da nota nova (usado no caminho dos anexos) */
  makeNoteId?: () => string;
  initialBody?: string;
  /** Chave do rascunho — só no modo create */
  draftKey?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  /** Time do tenant — fonte das sugestões de menção */
  sellers?: Seller[];
  /** uid de quem escreve, para não sugerir a si mesmo */
  currentUid?: string;
  /** Avisa quando o editor ganha ou perde foco (ancoragem no celular) */
  onFocusChange?: (focused: boolean) => void;
  /**
   * Recebe o `noteId` decidido pelo composer — é para onde os anexos já
   * subiram, então a nota precisa ser gravada com esse mesmo id.
   */
  onSubmit: (body: string, attachments: NoteAttachment[], noteId: string) => Promise<void>;
  onCancel?: () => void;
}

interface Draft {
  noteId: string;
  body: string;
  attachments: NoteAttachment[];
}

const draftStorageKey = (key: string) => `wm_note_draft_${key}`;

function readDraft(key?: string): Draft | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(draftStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed?.noteId) return null;
    return {
      noteId: parsed.noteId,
      body: parsed.body ?? '',
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    };
  } catch {
    return null; // rascunho corrompido ou storage bloqueado (modo privado)
  }
}

export function NoteComposer({
  mode = 'create',
  noteId,
  makeNoteId,
  initialBody = '',
  draftKey,
  placeholder = 'Contexto, correções ou orientações para quem seguir com o lead...',
  submitLabel = 'Registrar nota',
  autoFocus,
  sellers = [],
  currentUid,
  onFocusChange,
  onSubmit,
  onCancel,
}: NoteComposerProps) {
  const isCreate = mode === 'create';
  const [draft] = useState(() => (isCreate ? readDraft(draftKey) : null));

  // Id fixo por montagem: os anexos sobem para cá antes da nota existir
  const [composerNoteId] = useState(
    () => draft?.noteId ?? noteId ?? makeNoteId?.() ?? 'rascunho'
  );

  const [body, setBody] = useState(() => (isCreate ? draft?.body ?? '' : initialBody));
  /** Anexos que já subiram numa sessão anterior do rascunho */
  const [restored, setRestored] = useState<NoteAttachment[]>(() => draft?.attachments ?? []);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);

  // Avaliado uma vez: a câmera nativa só faz sentido em aparelho de toque, e
  // gravar áudio exige MediaRecorder + getUserMedia (e HTTPS).
  const [touch] = useState(isTouchDevice);
  const [canRecord] = useState(isRecordingSupported);

  // ── Menções ──────────────────────────────────────────────────────────────
  const [mention, setMention] = useState<{ start: number; query: string; caret: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const candidates = useMemo(
    () =>
      mention
        ? filterMentionCandidates(sellers, mention.query, {
            excludeUid: currentUid,
            alreadyMentioned: extractMentions(body),
          })
        : [],
    [mention, sellers, currentUid, body]
  );

  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Espelho do corpo num ref: mantém `selection` e `apply` estáveis, o que
  // evita re-renderizar a toolbar (10 ícones) a cada tecla digitada.
  const bodyRef = useRef(body);
  const { uploads, upload, cancel, remove, clear, ready, busy } = useAttachmentUpload(composerNoteId);

  const attachments = useMemo(() => [...restored, ...ready], [restored, ready]);

  /** Estado corrente do rascunho, para gravar na saída sem virar dependência. */
  const draftRef = useRef({ body, attachments });

  // Os espelhos são atualizados em efeito (e não durante o render, que é
  // proibido): os handlers que os leem só rodam depois da renderização.
  useEffect(() => { bodyRef.current = body; }, [body]);
  useEffect(() => { draftRef.current = { body, attachments }; }, [body, attachments]);

  // Autosize — a textarea cresce com o conteúdo até um teto
  useEffect(() => {
    const el = ref.current;
    if (!el || tab !== 'write') return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [body, tab]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  /** Grava (ou apaga) o rascunho agora. */
  const writeDraft = useCallback(() => {
    if (!isCreate || !draftKey) return;
    try {
      const key = draftStorageKey(draftKey);
      const { body: b, attachments: atts } = draftRef.current;
      if (b.trim() || atts.length > 0) {
        localStorage.setItem(key, JSON.stringify({ noteId: composerNoteId, body: b, attachments: atts }));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // storage indisponível: seguir sem rascunho é aceitável
    }
  }, [isCreate, draftKey, composerNoteId]);

  // Persiste com atraso: `localStorage` é síncrono e serializar a cada tecla
  // trava a digitação em aparelho fraco.
  useEffect(() => {
    if (!isCreate || !draftKey) return;
    const timer = setTimeout(writeDraft, 400);
    return () => clearTimeout(timer);
  }, [body, attachments, isCreate, draftKey, writeDraft]);

  // ...e grava na saída, senão fechar o painel logo depois de digitar perderia
  // o que ainda estava esperando o atraso acima.
  useEffect(() => writeDraft, [writeDraft]);

  /** Seleção atual da textarea; sem foco, o cursor conta como o fim do texto. */
  const selection = useCallback((): Selection => {
    const el = ref.current;
    const len = bodyRef.current.length;
    return { start: el?.selectionStart ?? len, end: el?.selectionEnd ?? len };
  }, []);

  /** Aplica um utilitário de edição e devolve o cursor para a textarea. */
  const apply = useCallback(
    (fn: (text: string, sel: Selection) => EditResult) => {
      const result = fn(bodyRef.current, selection());
      setBody(result.text);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(result.start, result.end);
      });
    },
    [selection]
  );

  /** Reavalia se o cursor está numa menção em andamento. */
  const syncMention = useCallback((text: string, caret: number) => {
    const found = findMentionQuery(text, caret);
    setMention(found ? { ...found, caret } : null);
    setMentionIndex(0);
  }, []);

  const pickMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mention) return;
      const result = insertMention(
        bodyRef.current,
        { start: mention.start, query: mention.query },
        mention.caret,
        candidate.name,
        candidate.uid
      );
      setBody(result.text);
      setMention(null);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(result.start, result.end);
      });
    },
    [mention]
  );

  const addFiles = useCallback(
    (files: FileList | File[] | null, source: NoteAttachmentSource = 'upload') => {
      if (!files) return;
      Array.from(files).forEach(file => void upload(file, source));
    },
    [upload]
  );

  const submit = async () => {
    const text = body.trim();
    if ((!text && attachments.length === 0) || saving || busy) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit(text, attachments, composerNoteId);
      if (isCreate) {
        setBody('');
        setRestored([]);
        clear();
        setTab('write');
        if (draftKey) {
          try { localStorage.removeItem(draftStorageKey(draftKey)); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('[NoteComposer] falha ao salvar nota:', err);
      setError('Não foi possível salvar. Verifique a conexão e tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Com o popover aberto, as setas e o Enter pertencem a ele
    if (mention && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(candidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }

    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') { e.preventDefault(); void submit(); return; }
    if (k === 'b') { e.preventDefault(); apply((t, s) => toggleWrap(t, s, '**')); return; }
    if (k === 'i') { e.preventDefault(); apply((t, s) => toggleWrap(t, s, '_')); return; }
    if (k === 'k') { e.preventDefault(); apply((t, s) => insertLink(t, s)); }
  };

  /**
   * Colar: arquivo do clipboard vira anexo; URL sobre texto selecionado vira
   * `[texto](url)` em vez de sobrescrever a seleção.
   */
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files, 'paste');
      return;
    }
    const pasted = e.clipboardData.getData('text/plain').trim();
    const sel = selection();
    if (sel.start === sel.end || !/^https?:\/\/\S+$/i.test(pasted)) return;
    e.preventDefault();
    apply((t, s) => insertLink(t, s, pasted));
  };

  const removeRestored = (id: string) => setRestored(list => list.filter(a => a.id !== id));

  const canSubmit = !saving && !busy && (!!body.trim() || attachments.length > 0);

  return (
    <div
      className={`note-composer card card-pad ${dragging ? 'note-composer-drag' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="note-composer-hd">
        <div className="note-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'write'}
            className={`note-tab ${tab === 'write' ? 'active' : ''}`}
            onClick={() => setTab('write')}
          >
            Escrever
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            className={`note-tab ${tab === 'preview' ? 'active' : ''}`}
            onClick={() => setTab('preview')}
            disabled={!body.trim()}
          >
            Visualizar
          </button>
        </div>
        {tab === 'write' && <MarkdownToolbar onApply={apply} disabled={saving} />}
      </div>

      {tab === 'write' ? (
        <textarea
          ref={ref}
          className="input note-textarea"
          rows={3}
          placeholder={placeholder}
          value={body}
          disabled={saving}
          onChange={e => {
            setBody(e.target.value);
            syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyUp={e => {
            // mover o cursor com as setas/clique também abre ou fecha o popover
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0);
            }
          }}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => {
            setMention(null);
            // Sem o atraso, tocar num botão da toolbar fecharia a ancoragem
            // antes de o clique chegar ao alvo.
            setTimeout(() => {
              if (!ref.current?.contains(document.activeElement)) onFocusChange?.(false);
            }, 120);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          aria-label="Corpo da nota"
        />
      ) : (
        <div className="note-preview">
          <MarkdownView body={body} />
        </div>
      )}

      {mention && candidates.length > 0 && (
        <MentionPopover
          candidates={candidates}
          activeIndex={mentionIndex}
          onPick={pickMention}
          onHover={setMentionIndex}
        />
      )}

      {dragging && <div className="note-dropzone">Solte para anexar</div>}

      {recording && (
        <AudioRecorder
          onReady={file => void upload(file, 'mic')}
          onClose={() => setRecording(false)}
        />
      )}

      {(uploads.length > 0 || restored.length > 0) && (
        <div className="att-chips">
          {restored.map(a => (
            <AttachmentChip
              key={a.id}
              upload={{
                id: a.id,
                name: a.name,
                size: a.size,
                mime: a.mime,
                kind: a.kind,
                source: a.source,
                status: 'done',
                progress: 100,
                attachment: a,
              }}
              onCancel={() => removeRestored(a.id)}
              onRemove={() => removeRestored(a.id)}
            />
          ))}
          {uploads.map(u => (
            <AttachmentChip
              key={u.id}
              upload={u}
              onCancel={() => cancel(u.id)}
              onRemove={() => void remove(u.id)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="note-error" role="alert">
          <Icon name="TriangleAlert" size={14} /> {error}
        </div>
      )}

      <div className="note-composer-ft">
        <div className="note-attach-actions">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={`${DOCUMENT_ACCEPT},${MEDIA_ACCEPT}`}
            className="sr-only-input"
            onChange={e => {
              addFiles(e.target.files);
              e.target.value = ''; // permite reanexar o mesmo arquivo
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => fileInput.current?.click()}
            disabled={saving}
            title="Anexar arquivo, imagem, vídeo ou áudio"
          >
            <Icon name="Paperclip" size={15} /> Anexar
          </button>

          {touch && <CaptureButtons onCapture={files => addFiles(files, 'camera')} disabled={saving} />}

          {canRecord && !recording && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRecording(true)}
              disabled={saving}
              title="Gravar um áudio agora"
            >
              <Icon name="Mic" size={15} /> Áudio
            </button>
          )}

          {!touch && <span className="muted note-hint">Markdown · Ctrl+Enter salva</span>}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {onCancel && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canSubmit}
            onClick={submit}
            title={busy ? 'Aguarde o envio dos anexos' : undefined}
          >
            <Icon name={isCreate ? 'StickyNote' : 'Check'} size={14} />
            {saving ? 'Salvando...' : busy ? 'Enviando anexos...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
