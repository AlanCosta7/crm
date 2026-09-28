/**
 * qa-scan-dead-controls.mjs — Varredura estática de controles sem ação
 *
 * Detecta em src/**\/*.tsx:
 *   1. <button> sem onClick e sem type="submit" (botão morto)
 *   2. Elementos com cursor: 'pointer' sem onClick no mesmo tag (ícone "clicável" morto)
 *   3. Handlers vazios: onClick={() => {}}
 *   4. href="#" ou <a> sem href
 *
 * Uso: node scripts/qa/qa-scan-dead-controls.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../src', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

// Extrai tags JSX completas (do `<button` até o `>` correspondente), multi-linha
function* extractTags(src, tagName) {
  const re = new RegExp(`<${tagName}(?=[\\s>])`, 'g');
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 0;
    let i = m.index;
    // avança até o fim da abertura da tag (contando chaves de expressões JSX)
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const tag = src.slice(m.index, i + 1);
    const line = src.slice(0, m.index).split('\n').length;
    yield { tag, line };
  }
}

const findings = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf-8');
  const rel = relative(join(ROOT, '..'), file);

  for (const { tag, line } of extractTags(src, 'button')) {
    const hasAction = /onClick|type=["']submit["']|type=\{/.test(tag);
    if (!hasAction) findings.push({ file: rel, line, kind: 'BOTÃO SEM AÇÃO', snippet: tag.replace(/\s+/g, ' ').slice(0, 110) });
    if (/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(tag)) {
      findings.push({ file: rel, line, kind: 'HANDLER VAZIO', snippet: tag.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }

  // cursor pointer sem onClick (qualquer tag)
  for (const { tag, line } of [...extractTags(src, 'div'), ...extractTags(src, 'span'), ...extractTags(src, 'Icon')]) {
    if (/cursor:\s*['"]pointer['"]/.test(tag) && !/onClick/.test(tag)) {
      findings.push({ file: rel, line, kind: 'POINTER SEM onClick', snippet: tag.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }

  for (const { tag, line } of extractTags(src, 'a')) {
    if (/href=["']#["']/.test(tag) || !/href/.test(tag)) {
      findings.push({ file: rel, line, kind: 'LINK MORTO', snippet: tag.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
for (const f of findings) {
  console.log(`[${f.kind}] ${f.file}:${f.line}\n    ${f.snippet}`);
}
console.log(`\nTotal: ${findings.length} achado(s) em ${walk(ROOT).length} arquivos varridos`);
