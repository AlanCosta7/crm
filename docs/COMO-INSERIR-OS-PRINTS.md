# Como inserir os prints nos guias do cliente

Você **não precisa editar o HTML**. Basta salvar cada print de tela com o **nome exato** abaixo,
dentro da pasta `docs/assets/`. Ao reabrir o guia correspondente, a imagem aparece sozinha
no lugar da moldura. Se um arquivo não existir, a moldura continua mostrando a instrução.

## Guia do Administrador Master (`WizMart-Guia-Admin-Master.html`)

### Lista de imagens (salve em `docs/assets/`)

| Arquivo | Tela | O que destacar no print |
|---|---|---|
| `01-login.png` | Login | Campos de e-mail/senha e o botão "Entrar" |
| `02-menu.png` | Tela inicial | Menu lateral (numerar as seções) |
| `03-painel.png` | Painel (Dashboard) | Cartões de indicadores |
| `04-usuario.png` | Configurações → Usuários → Novo | Campos "Cargo / Papel" e "Nível de Comissão (SDR)" |
| `05-funis.png` | Configurações → Pipelines | Lista de funis e estágios |
| `06-pipeline.png` | Pipeline → card aberto | BDR / SDR / Representante e botão "Calcular comissão" |
| `07-handoffs.png` | Handoffs | Handoffs pendentes e aceitos |
| `08-projetos.png` | Projetos de Layout | Lista com status (Pendente/Em andamento/Entregue) |
| `09-comissoes.png` | Comissões (calculadora) | Seleção do negócio, faturamento e o quadro "Resultado" |
| `10-relatorio-comissoes.png` | Relatório de Comissões | Filtros, total por vendedor e botão "Exportar CSV" |

## Guia de Captação de Leads (`WizMart-Guia-Captacao-Leads.html`)

### Lista de imagens (salve em `docs/assets/`)

| Arquivo | Tela | O que destacar no print |
|---|---|---|
| `leads-01-lista.png` | Configurações → Captação de Leads | Tabela de fontes, contadores de recebidos/bloqueados e o botão "Nova Fonte" |
| `leads-02-chave.png` | Modal de chave gerada | O campo com a chave e o botão "Copiar" |

## Dicas

- **Formato:** PNG (recomendado) ou JPG — se usar JPG, mantenha o mesmo nome trocando a extensão no HTML.
- **Largura:** ~1200px fica nítido na tela e no PDF.
- **Setas/destaques:** pode marcar "clique aqui" na própria imagem (use a ferramenta de marcação do macOS: abra o print no Preview → Ferramentas → Anotar).
- **Gerar PDF:** abra o HTML no navegador → Imprimir → "Salvar como PDF". O layout já está preparado para impressão A4.
</content>
