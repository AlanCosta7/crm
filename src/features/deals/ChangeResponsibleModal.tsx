/**
 * ChangeResponsibleModal.tsx — troca do responsável do card
 *
 * Autorização `manage_deal_cards` (BDR, Gestor e Master — 21/09/2026). Quem
 * aparece na lista depende de QUEM é o responsável hoje (ver
 * `utils/dealResponsible.ts`): o card com SDR troca de SDR, o card com Rep troca
 * de Rep, e assim por diante. Card sem ninguém (campo `owner` vazio) aceita
 * qualquer papel operacional — daí a lista poder ficar longa.
 *
 * Layout: overlay `fixed` e modal com altura limitada à tela — cabeçalho e
 * rodapé sempre visíveis, só o miolo rola. A lista de pessoas tem rolagem
 * própria (o campo "Motivo" não some embaixo dela), busca por nome e, quando há
 * mais de um papel, grupos por papel. O CSS global `.modal` não limita altura, e
 * `.modal-ov` é `absolute`: com a lista grande o modal estourava a tela e ficava
 * impossível rolar ou chegar nos botões.
 */

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { Av } from '../../components/ui/Av';
import type { Deal, SettingUser } from '../../types/crm';
import { RESPONSIBLE_FIELD_LABEL, responsibleField } from '../../utils/dealResponsible';

export interface ChangeResponsibleFormData {
  newUid: string;
  notes?: string;
}

interface ChangeResponsibleModalProps {
  deal: Deal;
  currentName: string;
  candidates: SettingUser[];
  onConfirm: (data: ChangeResponsibleFormData) => Promise<void>;
  onCancel: () => void;
}

const ROLE_ORDER = ['master', 'manager', 'bdr', 'sdr', 'rep'];
const ROLE_GROUP_LABEL: Record<string, string> = {
  master: 'Admin Master',
  manager: 'Gestores',
  bdr: 'BDRs',
  sdr: 'SDRs',
  rep: 'Representantes',
};

/** Só mostra a busca quando a lista já é grande o bastante para precisar dela. */
const SEARCH_THRESHOLD = 6;

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function ChangeResponsibleModal({ deal, currentName, candidates, onConfirm, onCancel }: ChangeResponsibleModalProps) {
  const [newUid, setNewUid] = useState('');
  const [notes,  setNotes]  = useState('');
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [submitError, setSubmitError] = useState('');

  const roleLabel = RESPONSIBLE_FIELD_LABEL[responsibleField(deal)];
  const showSearch = candidates.length > SEARCH_THRESHOLD;

  // Esc fecha (exceto enquanto grava — evita perder o resultado da operação).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  const groups = useMemo(() => {
    const q = normalize(search.trim());
    const filtered = candidates
      .filter(u => !q || normalize(u.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const byRole = new Map<string, SettingUser[]>();
    for (const u of filtered) byRole.set(u.role, [...(byRole.get(u.role) ?? []), u]);
    return [...byRole.entries()].sort(([a], [b]) => {
      const ia = ROLE_ORDER.indexOf(a); const ib = ROLE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [candidates, search]);

  const matchCount = groups.reduce((n, [, users]) => n + users.length, 0);
  const selectedUser = candidates.find(u => u.id === newUid);
  // Cabeçalho de grupo só faz sentido quando há mais de um papel na lista.
  const showGroupHeaders = new Set(candidates.map(u => u.role)).size > 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUid) {
      setError('Selecione quem será o novo responsável.');
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      await onConfirm({ newUid, notes: notes.trim() || undefined });
    } catch (err: any) {
      console.error('[ChangeResponsibleModal] Erro ao trocar responsável:', err);
      setSubmitError(
        err?.code === 'permission-denied'
          ? 'Você não tem permissão para trocar o responsável deste card.'
          : 'Não foi possível trocar o responsável. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (u: SettingUser) => {
    const selected = newUid === u.id;
    const focused = focusedId === u.id;
    return (
      <label
        key={u.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          background: selected ? 'var(--primary-light)' : '#fff',
          borderBottom: '1px solid var(--border)',
          outline: focused ? '2px solid var(--primary)' : 'none', outlineOffset: -2,
          cursor: 'pointer',
        }}
      >
        {/* Radio real (navegável por teclado: setas/Tab), só escondido visualmente. */}
        <input
          type="radio"
          name="newResponsible"
          value={u.id || ''}
          checked={selected}
          onChange={() => { setNewUid(u.id || ''); setError(''); }}
          // contorno só para foco por teclado — depois de um clique de mouse ficaria pesado
          onFocus={e => setFocusedId(e.currentTarget.matches(':focus-visible') ? (u.id || '') : '')}
          onBlur={() => setFocusedId('')}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        />
        <Av initials={u.initials} color={u.color} size={28} />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, color: selected ? 'var(--primary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {u.name}
        </span>
        {selected && <Icon name="Check" size={16} color="var(--primary)" style={{ flexShrink: 0 }} />}
      </label>
    );
  };

  return (
    <div
      className="modal-ov"
      style={{ position: 'fixed', zIndex: 300, padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onCancel(); }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-responsible-title"
        style={{ maxWidth: 480, width: '100%', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-hd" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="ArrowRightLeft" size={18} color="var(--primary)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 id="change-responsible-title" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Trocar responsável</h3>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {deal.name} · hoje: <strong>{currentName}</strong>
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Fechar" style={{ flexShrink: 0 }}>
            <Icon name="X" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          {/* Só o miolo rola — cabeçalho e rodapé ficam sempre à vista. */}
          <div className="modal-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', minHeight: 0, flex: 1 }}>
            <div className="field" style={{ margin: 0 }}>
              <div className="fl" style={{ marginBottom: 4 }}>
                Novo responsável ({roleLabel}) *
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 0, marginBottom: 8 }}>
                Quem sai deixa de ver o card e as atividades pendentes dele passam para o novo responsável (a régua continua de onde parou). Só o campo do {roleLabel} é alterado — as demais assinaturas ficam como estão.
              </p>

              {candidates.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>Nenhum outro usuário ativo com esse papel para este produto.</p>
              ) : (
                <>
                  {showSearch && (
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <Icon name="Search" size={14} color="var(--text-2)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      <input
                        className="input"
                        type="search"
                        autoFocus
                        placeholder={`Buscar entre ${candidates.length} pessoas…`}
                        aria-label="Buscar responsável por nome"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: 30, width: '100%' }}
                      />
                    </div>
                  )}

                  <div
                    role="radiogroup"
                    aria-label="Novo responsável"
                    style={{ position: 'relative', maxHeight: 'min(300px, 38vh)', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, overscrollBehavior: 'contain' }}
                  >
                    {matchCount === 0 ? (
                      <p className="muted" style={{ fontSize: 12.5, padding: '14px 12px', margin: 0, textAlign: 'center' }}>
                        Ninguém encontrado para “{search.trim()}”.
                      </p>
                    ) : groups.map(([role, users]) => (
                      <div key={role}>
                        {showGroupHeaders && (
                          <div style={{
                            position: 'sticky', top: 0, zIndex: 1, padding: '5px 12px', background: 'var(--bg)',
                            fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
                            color: 'var(--text-2)', borderBottom: '1px solid var(--border)',
                          }}>
                            {ROLE_GROUP_LABEL[role] ?? role} · {users.length}
                          </div>
                        )}
                        {users.map(renderRow)}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6, marginBottom: 0 }}>{error}</p>}
            </div>

            <div className="field" style={{ margin: 0 }}>
              <div className="fl">Motivo da troca <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></div>
              <textarea
                className="input"
                rows={2}
                placeholder="Ex.: reequilíbrio de carteira, férias, mudança de região..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          {submitError && (
            <div role="alert" style={{ flexShrink: 0, margin: '0 20px 10px', padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="AlertTriangle" size={15} color="#B91C1C" />
              {submitError}
            </div>
          )}

          <div className="modal-ft" style={{ flexShrink: 0, alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedUser ? <>Novo: <strong style={{ color: 'var(--text-primary)' }}>{selectedUser.name}</strong></> : ''}
            </span>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || candidates.length === 0}>
                <Icon name="ArrowRightLeft" size={16} />
                {saving ? 'Trocando...' : 'Trocar responsável'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangeResponsibleModal;
