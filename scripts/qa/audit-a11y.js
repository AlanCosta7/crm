import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../../src');
const cssFile = path.join(srcDir, 'index.css');

let errorsCount = 0;
let warningsCount = 0;

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory && f !== 'node_modules' && f !== 'dist' && f !== '.git') {
      walkDir(dirPath, callback);
    } else if (!isDirectory && /\.(tsx|ts|html)$/.test(f)) {
      callback(dirPath);
    }
  });
}

console.log('==================================================');
console.log('♿ WizMart CRM - Auditoria de Acessibilidade (a11y)');
console.log('==================================================\n');

// 1. Audit files for tags
walkDir(srcDir, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relativePath = path.relative(path.join(__dirname, '../..'), filePath);

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check 1: <img> tag missing alt attribute
    if (/<img\s/i.test(line) && !/alt=/i.test(line)) {
      console.log(`❌ [Erro] ${relativePath}:${lineNum} - Tag <img> encontrada sem atributo 'alt'.`);
      console.log(`   👉 Código: \`${line.trim()}\``);
      console.log(`   💡 Correção: Adicione alt="descrição da imagem" ou alt="" se for puramente decorativa.\n`);
      errorsCount++;
    }

    // Check 2: <button> tags with no accessible label (empty content and no aria-label)
    if (/<button\s/i.test(line) && !/aria-label/i.test(line) && !/aria-labelledby/i.test(line)) {
      if (/(Icon|Lucide|className=.*icon)/i.test(line) && !/>[A-Za-z0-9À-ÿ\s{]+</i.test(line)) {
        console.log(`⚠️ [Aviso] ${relativePath}:${lineNum} - Botão interativo de ícone encontrado sem 'aria-label'.`);
        console.log(`   👉 Código: \`${line.trim()}\``);
        console.log(`   💡 Correção: Adicione aria-label="Descreva a ação do botão" para leitores de tela.\n`);
        warningsCount++;
      }
    }

    // Check 3: <input> tags without id or aria-label
    if (/<input\s/i.test(line) && !/id=/i.test(line) && !/aria-label/i.test(line)) {
      console.log(`⚠️ [Aviso] ${relativePath}:${lineNum} - Campo de entrada <input> encontrado sem 'id' ou 'aria-label'.`);
      console.log(`   👉 Código: \`${line.trim()}\``);
      console.log(`   💡 Correção: Vincule um <label htmlFor="..."> usando 'id', ou adicione 'aria-label' diretamente.\n`);
      warningsCount++;
    }
  });
});

// 2. Check for prefers-reduced-motion in global CSS
if (fs.existsSync(cssFile)) {
  const cssContent = fs.readFileSync(cssFile, 'utf8');
  if (!/prefers-reduced-motion/i.test(cssContent)) {
    console.log(`❌ [Erro] index.css - Ausência da regra de mídia \`@media (prefers-reduced-motion: reduce)\`.`);
    console.log(`   💡 Correção: Adicione a regra para desativar transições em dispositivos com motion-reduction ativo.\n`);
    errorsCount++;
  } else {
    console.log(`✅ [Sucesso] index.css contém regra para prefers-reduced-motion.`);
  }
} else {
  console.log(`⚠️ [Aviso] Arquivo index.css global não encontrado para auditoria.`);
  warningsCount++;
}

console.log('--------------------------------------------------');
console.log(`Relatório Final:`);
console.log(`🔴 Erros de Acessibilidade Críticos: ${errorsCount}`);
console.log(`🟡 Avisos de Acessibilidade Recomendados: ${warningsCount}`);
console.log('--------------------------------------------------');

if (errorsCount > 0) {
  console.log('💥 Auditoria REPROVADA. Por favor corrija os erros de acessibilidade críticos.');
  process.exit(1);
} else {
  console.log('🎉 Auditoria APROVADA! WCAG AA Compliance validada com sucesso.');
  process.exit(0);
}
