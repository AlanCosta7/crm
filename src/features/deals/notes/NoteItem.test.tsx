import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteItem } from './NoteItem';

// O composer importa o hook de upload, que importa a config do Firebase — sem
// este mock cada arquivo de teste inicializa o SDK e tenta falar com o
// emulador, o que só torna os testes lentos.
vi.mock('../../../config/firebase', () => ({
  storage: {},
  db: {},
  auth: {},
  rtdb: {},
  functions: {},
}));

import type { NoteFeedItem } from './noteFeed';
import type { Seller } from '../../../types/crm';

const sellers: Seller[] = [
  { id: 'sdr-001', name: 'João SDR', initials: 'JS', color: '#B45309' },
  { id: 'rep-001', name: 'Carla Rep', initials: 'CR', color: '#B91C1C' },
];

const item = (over: Partial<NoteFeedItem> = {}): NoteFeedItem => ({
  id: 'n1',
  origin: 'note',
  authorId: 'sdr-001',
  body: 'Cliente pediu **desconto**.',
  attachments: [],
  createdAt: new Date(Date.now() - 90 * 60 * 1000), // há 1 h
  editedAt: null,
  ...over,
});

const noop = {
  onEdit: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onToggleChecklist: vi.fn().mockResolvedValue(undefined),
  onRemoveAttachment: vi.fn().mockResolvedValue(undefined),
};

const setup = (props: Partial<Parameters<typeof NoteItem>[0]> = {}) =>
  render(
    <NoteItem
      item={item()}
      sellers={sellers}
      currentUid="sdr-001"
      canEdit
      canDelete
      {...noop}
      {...props}
    />
  );

describe('NoteItem — exibição', () => {
  it('mostra "Você" para a própria nota e o markdown renderizado', () => {
    setup();
    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.getByText('desconto').tagName).toBe('STRONG');
  });

  it('mostra o nome do autor quando é de outra pessoa', () => {
    setup({ item: item({ authorId: 'rep-001' }), currentUid: 'sdr-001', canEdit: false, canDelete: false });
    expect(screen.getByText('Carla Rep')).toBeInTheDocument();
  });

  it('usa data relativa e guarda a data completa no title', () => {
    setup();
    expect(screen.getByText(/há 1 h/)).toBeInTheDocument();
  });

  it('marca nota editada', () => {
    setup({ item: item({ editedAt: new Date() }) });
    expect(screen.getByText(/editada/)).toBeInTheDocument();
  });

  it('identifica registro antigo e não oferece ações', () => {
    setup({ item: item({ origin: 'legacy' }), canEdit: false, canDelete: false });
    expect(screen.getByText(/registro antigo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações da nota' })).not.toBeInTheDocument();
  });
});

describe('NoteItem — permissões', () => {
  it('sem permissão nenhuma, não mostra o menu', () => {
    setup({ canEdit: false, canDelete: false });
    expect(screen.queryByRole('button', { name: 'Ações da nota' })).not.toBeInTheDocument();
  });

  it('master vê apenas Excluir na nota de terceiro', async () => {
    setup({ canEdit: false, canDelete: true, currentUid: 'master-001' });
    await userEvent.click(screen.getByRole('button', { name: 'Ações da nota' }));

    expect(screen.getByRole('menuitem', { name: /excluir/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /editar/i })).not.toBeInTheDocument();
  });
});

describe('NoteItem — edição', () => {
  it('abre o editor com o corpo atual e salva', async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined);
    setup({ onEdit });

    await userEvent.click(screen.getByRole('button', { name: 'Ações da nota' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /editar/i }));

    const ta = screen.getByLabelText('Corpo da nota');
    expect(ta).toHaveValue('Cliente pediu **desconto**.');

    await userEvent.clear(ta);
    await userEvent.type(ta, 'texto corrigido');
    await userEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('texto corrigido', []));
    await waitFor(() => expect(screen.queryByLabelText('Corpo da nota')).not.toBeInTheDocument());
  });

  it('cancelar volta sem salvar', async () => {
    const onEdit = vi.fn();
    setup({ onEdit });

    await userEvent.click(screen.getByRole('button', { name: 'Ações da nota' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('desconto')).toBeInTheDocument();
  });
});

describe('NoteItem — exclusão', () => {
  it('pede confirmação antes de excluir', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    setup({ onDelete });

    await userEvent.click(screen.getByRole('button', { name: 'Ações da nota' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /excluir/i }));

    expect(screen.getByText('Excluir esta nota?')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('cancelar a confirmação não exclui', async () => {
    const onDelete = vi.fn();
    setup({ onDelete });

    await userEvent.click(screen.getByRole('button', { name: 'Ações da nota' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /excluir/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Excluir esta nota?')).not.toBeInTheDocument();
  });
});

describe('NoteItem — anexos', () => {
  const comAnexo = item({
    body: 'Segue a proposta.',
    attachments: [
      {
        id: 'att1',
        kind: 'document',
        name: 'Proposta Comercial.pdf',
        mime: 'application/pdf',
        size: 2 * 1024 * 1024,
        storagePath: 'tenants/wizmart/notes/n1/att1/Proposta Comercial.pdf',
        url: 'https://storage.example/proposta.pdf',
        source: 'upload',
        uploadedBy: 'sdr-001',
      },
    ],
  });

  it('mostra o anexo com nome, tamanho e link para baixar', () => {
    setup({ item: comAnexo });
    const link = screen.getByRole('link', { name: /proposta comercial\.pdf/i });
    expect(link).toHaveAttribute('href', 'https://storage.example/proposta.pdf');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });

  it('autor exclui o anexo com confirmação', async () => {
    const onRemoveAttachment = vi.fn().mockResolvedValue(undefined);
    setup({ item: comAnexo, onRemoveAttachment });

    await userEvent.click(screen.getByRole('button', { name: /excluir proposta comercial\.pdf/i }));
    expect(onRemoveAttachment).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onRemoveAttachment).toHaveBeenCalledWith(comAnexo.attachments[0]));
  });

  it('quem não é autor não vê a ação de excluir anexo', () => {
    setup({ item: comAnexo, canEdit: false, canDelete: false });
    expect(screen.queryByRole('button', { name: /excluir proposta/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /proposta comercial\.pdf/i })).toBeInTheDocument();
  });

  it('nota só com anexo, sem texto, renderiza normalmente', () => {
    setup({ item: item({ body: '', attachments: comAnexo.attachments }) });
    expect(screen.getByRole('link', { name: /proposta comercial\.pdf/i })).toBeInTheDocument();
  });
});

describe('NoteItem — apresentação por tipo de anexo', () => {
  const comTudo = item({
    body: 'Visita realizada.',
    attachments: [
      {
        id: 'img1', kind: 'image', name: 'fachada.webp', mime: 'image/webp', size: 300_000,
        storagePath: 'p/img1', url: 'https://s/img.webp', thumbUrl: 'https://s/thumb.webp',
        source: 'camera', uploadedBy: 'sdr-001',
      },
      {
        id: 'au1', kind: 'audio', name: 'recado.m4a', mime: 'audio/mp4', size: 200_000,
        storagePath: 'p/au1', url: 'https://s/recado.m4a', durationMs: 30_000,
        source: 'mic', uploadedBy: 'sdr-001',
      },
      {
        id: 'doc1', kind: 'document', name: 'orcamento.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 90_000, storagePath: 'p/doc1', url: 'https://s/orcamento.xlsx',
        source: 'upload', uploadedBy: 'sdr-001',
      },
    ],
  });

  it('cada tipo ganha a sua apresentação na mesma nota', () => {
    const { container } = setup({ item: comTudo });

    // imagem no mosaico
    expect(screen.getByRole('img', { name: 'fachada.webp' })).toBeInTheDocument();
    // áudio no player
    expect(container.querySelector('audio')).toHaveAttribute('src', 'https://s/recado.m4a');
    expect(screen.getByText('0:00 / 0:30')).toBeInTheDocument();
    // documento no card com download
    expect(screen.getByRole('link', { name: /orcamento\.xlsx/i })).toHaveAttribute(
      'href',
      'https://s/orcamento.xlsx'
    );
  });

  it('excluir mídia usa o mesmo handler dos outros tipos', async () => {
    const onRemoveAttachment = vi.fn().mockResolvedValue(undefined);
    setup({ item: comTudo, onRemoveAttachment });

    await userEvent.click(screen.getByRole('button', { name: /excluir fachada\.webp/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(onRemoveAttachment).toHaveBeenCalledWith(expect.objectContaining({ id: 'img1' }))
    );
  });
});

describe('NoteItem — checklist', () => {
  const comChecklist = item({ body: '- [ ] ligar\n- [x] enviar' });

  it('autor consegue marcar e recebe o índice', async () => {
    const onToggleChecklist = vi.fn().mockResolvedValue(undefined);
    setup({ item: comChecklist, onToggleChecklist });

    await userEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onToggleChecklist).toHaveBeenCalledWith(0);
  });

  it('quem não é autor vê a checklist travada', () => {
    setup({ item: comChecklist, canEdit: false, canDelete: false });
    screen.getAllByRole('checkbox').forEach(cb => expect(cb).toBeDisabled());
  });
});
