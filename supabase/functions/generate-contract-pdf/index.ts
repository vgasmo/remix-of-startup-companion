/**
 * Generate Contract PDF Edge Function
 * Creates a professional PDF contract based on the official Startup Leiria minuta.
 * Uses raw PDF operators for full Portuguese character support via WinAnsiEncoding.
 * Source basis: Minuta Oficial de Contrato de Incubação (current approved version).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts'

interface ContractData {
  contractNumber: string | null;
  startupName: string;
  startupDescription: string | null;
  nif: string | null;
  contactName: string | null;
  contactEmail: string | null;
  address: string | null;
  incubationType: string;
  isVirtual: boolean;
  buildingName: string | null;
  buildingAddress: string | null;
  squareMeters: number | null;
  monthlyFee: number;
  currency: string;
  discountPercentage: number;
  discountMonths: number;
  effectiveFee: number;
  equityPercentage: number | null;
  startDate: string;
  endDate: string | null;
  projectName: string | null;
}

// WinAnsiEncoding map for Portuguese characters
const WIN_ANSI: Record<string, number> = {
  'À': 192, 'Á': 193, 'Â': 194, 'Ã': 195, 'Ä': 196,
  'È': 200, 'É': 201, 'Ê': 202, 'Ë': 203,
  'Ì': 204, 'Í': 205, 'Î': 206, 'Ï': 207,
  'Ò': 210, 'Ó': 211, 'Ô': 212, 'Õ': 213, 'Ö': 214,
  'Ù': 217, 'Ú': 218, 'Û': 219, 'Ü': 220,
  'à': 224, 'á': 225, 'â': 226, 'ã': 227, 'ä': 228,
  'è': 232, 'é': 233, 'ê': 234, 'ë': 235,
  'ì': 236, 'í': 237, 'î': 238, 'ï': 239,
  'ò': 242, 'ó': 243, 'ô': 244, 'õ': 245, 'ö': 246,
  'ù': 249, 'ú': 250, 'û': 251, 'ü': 252,
  'Ç': 199, 'ç': 231, 'Ñ': 209, 'ñ': 241,
  'º': 186, 'ª': 170, '\u20AC': 128, '\u2013': 150, '\u2014': 151,
  '\u201C': 147, '\u201D': 148, '\u2018': 145, '\u2019': 146,
  '\u2026': 133,
};

function encodePdfString(text: string): string {
  let result = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') {
      result += '\\' + ch;
    } else if (code >= 32 && code <= 126) {
      result += ch;
    } else if (WIN_ANSI[ch] !== undefined) {
      result += '\\' + WIN_ANSI[ch].toString(8).padStart(3, '0');
    } else {
      result += '?';
    }
  }
  return result;
}

// Simple text wrapping
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatCurrency(value: number): string {
  return value.toFixed(2).replace('.', ',') + ' €';
}

function numberToWords(n: number): string {
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const teens = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  
  if (n === 0) return 'zero';
  if (n === 100) return 'cem';
  
  const parts: string[] = [];
  if (n >= 100) { parts.push(hundreds[Math.floor(n / 100)]); n %= 100; }
  if (n >= 20) { parts.push(tens[Math.floor(n / 10)]); n %= 10; }
  if (n >= 10) { parts.push(teens[n - 10]); n = 0; }
  if (n > 0) { parts.push(units[n]); }
  
  return parts.filter(Boolean).join(' e ');
}

interface PdfBuilder {
  objects: string[];
  objectOffsets: number[];
  currentOffset: number;
  pageContentIds: number[];
  pageObjectIds: number[];
}

function createPdfBuilder(): PdfBuilder {
  return { objects: [], objectOffsets: [], currentOffset: 0, pageContentIds: [], pageObjectIds: [] };
}

function addObj(b: PdfBuilder, content: string): number {
  const id = b.objects.length + 1;
  b.objectOffsets.push(b.currentOffset);
  const obj = `${id} 0 obj\n${content}\nendobj\n`;
  b.objects.push(obj);
  b.currentOffset += new TextEncoder().encode(obj).length;
  return id;
}

// A4 dimensions in points: 595.28 x 841.89
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_L = 70;
const MARGIN_R = 70;
const MARGIN_T = 60;
const MARGIN_B = 60;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const LINE_H = 14;
const PARA_SPACE = 8;

interface PageStream {
  lines: string[];
  y: number;
}

function newPageStream(): PageStream {
  return { lines: [], y: PAGE_H - MARGIN_T };
}

function addLine(ps: PageStream, x: number, text: string, fontSize: number, fontKey: string): void {
  ps.lines.push(`BT /${fontKey} ${fontSize} Tf ${x} ${ps.y} Td (${encodePdfString(text)}) Tj ET`);
  ps.y -= LINE_H;
}

function addLineB(ps: PageStream, x: number, text: string, fontSize: number): void {
  addLine(ps, x, text, fontSize, 'F2');
}

function addLineR(ps: PageStream, x: number, text: string, fontSize: number): void {
  addLine(ps, x, text, fontSize, 'F1');
}

function addLineI(ps: PageStream, x: number, text: string, fontSize: number): void {
  addLine(ps, x, text, fontSize, 'F3');
}

function addBlank(ps: PageStream, height: number = PARA_SPACE): void {
  ps.y -= height;
}

function addWrapped(ps: PageStream, x: number, text: string, fontSize: number, fontKey: string, maxChars: number): void {
  const wrappedLines = wrapText(text, maxChars);
  for (const line of wrappedLines) {
    addLine(ps, x, line, fontSize, fontKey);
  }
}

function addHorizontalLine(ps: PageStream, x1: number, x2: number): void {
  ps.lines.push(`${x1} ${ps.y + 7} m ${x2} ${ps.y + 7} l S`);
}

function generateContractPdf(data: ContractData): Uint8Array {
  const b = createPdfBuilder();
  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  b.currentOffset = header.length;

  // Font references (will use IDs after catalog)
  const charsPerLine = 75;
  const indentChars = 72;

  // Build page content streams
  const pageStreams: PageStream[] = [];
  let ps = newPageStream();
  pageStreams.push(ps);

  function checkPage(needed: number = LINE_H * 3) {
    if (ps.y < MARGIN_B + needed) {
      ps = newPageStream();
      pageStreams.push(ps);
    }
  }

  // ========== PAGE 1 ==========
  // Signature lines top-right
  ps.y = PAGE_H - 35;
  addLineR(ps, 380, '1.º out. ___________________', 8);
  addBlank(ps, 4);
  addLineR(ps, 380, '2.º out. ___________________', 8);
  
  // Logo placeholder area (top left) - line under logo
  ps.y = PAGE_H - 90;
  addHorizontalLine(ps, MARGIN_L, MARGIN_L + 130);

  // Title
  ps.y = PAGE_H - 120;
  addBlank(ps, 10);
  // Centered title
  const title = 'Contrato de Prestação de Serviços';
  ps.lines.push(`BT /F1 22 Tf ${PAGE_W / 2 - 180} ${ps.y} Td (${encodePdfString(title)}) Tj ET`);
  ps.y -= 30;

  addBlank(ps, 10);

  // "Entre"
  addLineR(ps, MARGIN_L, 'Entre', 10);
  addBlank(ps);

  // Primeiro Outorgante
  const p1Text = `A Startup Leiria - Associação para a Promoção do Empreendedorismo, Inovação e Novas Tecnologias, NIPC n.º 507 019 415, com sede em Rua da Carvalha, n.º 570, 2400-441 Leiria, representada por Maria Eduarda da Silva Teixeira Fernandes, na qualidade de Presidente do Conselho de Administração, adiante designada como Primeiro Outorgante,`;
  addWrapped(ps, MARGIN_L, p1Text, 10, 'F1', charsPerLine);
  addBlank(ps);

  addLineR(ps, MARGIN_L, 'E', 10);
  addBlank(ps);

  // Segundo Outorgante
  const nifStr = data.nif ? `NIPC n.º ${data.nif}` : 'NIPC n.º ___________';
  const addressStr = data.address || '________________________________';
  const contactStr = data.contactName || '________________________________';
  const p2Text = `A ${data.startupName}, ${nifStr}, com sede em ${addressStr}, representada por ${contactStr}, na qualidade de gerente(s), adiante designada como Segundo Outorgante,`;
  
  // First part with bold company name
  const p2Parts = wrapText(p2Text, charsPerLine);
  for (const line of p2Parts) {
    // Bold the startup name if it appears in this line
    if (line.includes(data.startupName)) {
      const idx = line.indexOf(data.startupName);
      const before = line.substring(0, idx);
      const after = line.substring(idx + data.startupName.length);
      if (before) {
        ps.lines.push(`BT /F1 10 Tf ${MARGIN_L} ${ps.y} Td (${encodePdfString(before)}) Tj ET`);
        // Bold part
        const beforeWidth = before.length * 5;
        ps.lines.push(`BT /F2 10 Tf ${MARGIN_L + beforeWidth} ${ps.y} Td (${encodePdfString(data.startupName)}) Tj ET`);
        if (after) {
          const nameWidth = data.startupName.length * 5.5;
          ps.lines.push(`BT /F1 10 Tf ${MARGIN_L + beforeWidth + nameWidth} ${ps.y} Td (${encodePdfString(after)}) Tj ET`);
        }
      } else {
        ps.lines.push(`BT /F2 10 Tf ${MARGIN_L} ${ps.y} Td (${encodePdfString(data.startupName)}) Tj ET`);
        if (after) {
          const nameWidth = data.startupName.length * 5.5;
          ps.lines.push(`BT /F1 10 Tf ${MARGIN_L + nameWidth} ${ps.y} Td (${encodePdfString(after)}) Tj ET`);
        }
      }
      ps.y -= LINE_H;
    } else {
      addLineR(ps, MARGIN_L, line, 10);
    }
  }
  addBlank(ps);

  addWrapped(ps, MARGIN_L, 'é livremente celebrado o presente contrato que se regerá pelas cláusulas seguintes:', 10, 'F1', charsPerLine);
  addBlank(ps, 14);

  // === Cláusula 1.ª ===
  checkPage(LINE_H * 6);
  const clausulaX = PAGE_W / 2 - 35;
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 1.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;

  const projectName = data.projectName || data.startupName;
  const modalityName = data.isVirtual ? 'incubação e aceleração virtual' : 'incubação e aceleração física';
  const c1Text = `O presente contrato tem por objetivo definir o serviço de incubação e aceleração prestado pelo Primeiro Outorgante em benefício do Segundo Outorgante, para o desenvolvimento do projeto intitulado – ${projectName} na Startup Leiria.`;
  addWrapped(ps, MARGIN_L, c1Text, 10, 'F1', charsPerLine);
  addBlank(ps, 14);

  // === Cláusula 2.ª ===
  checkPage(LINE_H * 15);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 2.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;

  addWrapped(ps, MARGIN_L, `1. A prestação de serviços referida na cláusula anterior inclui um conjunto de serviços descritos nas "Condições de Funcionamento" - Anexo I, e que faz parte integrante deste contrato, a saber:`, 10, 'F1', indentChars);
  addBlank(ps, 2);

  const services = [
    'O acesso aos serviços básicos;',
    `A instalação, para efeitos postais, da sede social do Segundo Outorgante, no edifício do Primeiro Outorgante sito na Rua da Carvalha, n.º 570, 2400-441 Leiria;`,
    'Acesso às salas de reunião sem custos, mediante disponibilidade e marcação prévia;',
    'A prestação do conjunto de serviços técnicos, Mentor dedicado, reuniões de acompanhamento do projeto, Coaching individual, acesso à rede de contactos, acesso aos eventos do ecossistema, apoio à formulação e modelação do negócio;',
  ];

  if (!data.isVirtual) {
    services.push('A cedência dum espaço numa sala de incubação em uma das localizações do Primeiro Outorgante, para a modalidade de incubação e aceleração física.');
  }

  const letters = ['a)', 'b)', 'c)', 'd)', 'e)'];
  for (let i = 0; i < services.length; i++) {
    checkPage(LINE_H * 3);
    const prefix = `   ${letters[i]} `;
    const wrapped = wrapText(prefix + services[i], indentChars);
    for (let j = 0; j < wrapped.length; j++) {
      addLineR(ps, MARGIN_L + 15, j === 0 ? wrapped[j] : '       ' + wrapped[j], 10);
    }
    addBlank(ps, 2);
  }

  addBlank(ps, 4);
  checkPage(LINE_H * 6);
  addWrapped(ps, MARGIN_L, `2. O Segundo Outorgante poderá solicitar a alteração da modalidade de incubação e aceleração sempre que a gestão da sua equipa assim o justificar, sem custo adicional, bastando comunicar o seu pedido por escrito ao Primeiro Outorgante. São consideradas alterações da modalidade de incubação e aceleração as seguintes situações:`, 10, 'F1', indentChars);
  addBlank(ps, 2);

  const changes = [
    'passar de incubação e aceleração virtual para incubação e aceleração física ou vice-versa;',
    'mudar de sala e/ou solicitar disponibilização de outra(s) sala(s);',
    'Mudar de localização entre os diversos espaços administrados pela Startup Leiria.',
  ];
  for (let i = 0; i < changes.length; i++) {
    checkPage(LINE_H * 2);
    addLineR(ps, MARGIN_L + 30, `${letters[i]} ${changes[i]}`, 10);
    addBlank(ps, 2);
  }

  addBlank(ps, 4);
  checkPage(LINE_H * 4);
  addWrapped(ps, MARGIN_L, `3. De acordo com a disponibilidade de espaços tipologia nos diversos edifícios geridos, o Primeiro Outorgante confirmará por escrito a data em que o Segundo Outorgante poderá proceder à mudança de espaço (ou ocupar espaço adicional), indicando a localização e respetiva área.`, 10, 'F1', indentChars);

  // === Cláusula 3.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 4);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 3.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addWrapped(ps, MARGIN_L, 'O Segundo Outorgante compromete-se a não dar ao equipamento e às instalações cedidos uso diferente do que fica consignado na primeira cláusula deste contrato.', 10, 'F1', charsPerLine);

  // === Cláusula 4.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 4);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 4.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addWrapped(ps, MARGIN_L, 'Obriga-se o Segundo Outorgante a confirmar o estado e a conservar o equipamento e as instalações cedidas em bom estado, sendo da sua responsabilidade os encargos respeitantes a quaisquer deteriorações, salvo as inerentes a uma prudente utilização ou resultantes do desgaste do tempo.', 10, 'F1', charsPerLine);

  // === Cláusula 5.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 3);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 5.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addWrapped(ps, MARGIN_L, 'Obriga-se o Segundo Outorgante a fornecer os elementos necessários à avaliação periódica dos seus resultados pelo Primeiro Outorgante.', 10, 'F1', charsPerLine);

  // === Cláusula 6.ª - PRICING ===
  addBlank(ps, 14);
  checkPage(LINE_H * 12);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 6.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;

  const feeStr = formatCurrency(data.monthlyFee);
  const feeWords = numberToWords(Math.floor(data.monthlyFee));
  
  let c6p1 = `1. O Segundo Outorgante pagará ao Primeiro Outorgante, pelo conjunto de serviços técnicos na modalidade de ${modalityName}, a quantia mensal de ${feeStr} (${feeWords} euros).`;
  
  if (data.discountPercentage > 0) {
    c6p1 += ` Por deliberação do Conselho de Administração, terá um desconto de ${data.discountPercentage}% sobre o valor base, durante um período de ${data.discountMonths} (${numberToWords(data.discountMonths)}) meses, a partir da data de entrada em vigor do presente contrato. Findo esse período, o segundo outorgante pagará o valor mensal correspondente ao da tabela de preços em vigor.`;
  }
  addWrapped(ps, MARGIN_L, c6p1, 10, 'F1', indentChars);
  addBlank(ps, 4);

  checkPage(LINE_H * 3);
  addWrapped(ps, MARGIN_L, '2. Estes valores serão revistos de dois em dois anos e acrescidos de IVA à taxa legal em vigor.', 10, 'F1', indentChars);
  addBlank(ps, 4);

  checkPage(LINE_H * 4);
  addWrapped(ps, MARGIN_L, '3. Quando se verifique a mudança de modalidade de incubação e aceleração de acordo com o disposto no número 2 e 3 da cláusula segunda, o Primeiro Outorgante atualizará automaticamente o valor mensal de acordo com a dimensão do espaço cedido e a tabela de preços em vigor, a partir da data da mudança.', 10, 'F1', indentChars);
  addBlank(ps, 4);

  checkPage(LINE_H * 4);
  addWrapped(ps, MARGIN_L, '4. Para efeitos de revisão do montante mensal de acordo com o disposto no número 1 da presente cláusula, o Primeiro Outorgante obriga-se a enviar ao Segundo Outorgante, com a antecedência de 60 (sessenta) dias relativamente à data em que pretende que se opere o aumento, uma comunicação por escrito onde estabelece os termos da revisão.', 10, 'F1', indentChars);
  addBlank(ps, 4);

  checkPage(LINE_H * 3);
  addWrapped(ps, MARGIN_L, '5. Caso o Segundo Outorgante nada diga no prazo de 30 (trinta) dias a contar da data da comunicação referida no número anterior, deve entender-se o silêncio como aceitação tácita da revisão de montante.', 10, 'F1', indentChars);
  addBlank(ps, 4);

  checkPage(LINE_H * 4);
  addWrapped(ps, MARGIN_L, '6. Pelo contrário, caso o Segundo Outorgante não se possa conformar com o novo montante a pagar, terá o direito de denunciar o contrato, com efeitos à data em que o Primeiro Outorgante pretende que a revisão opere, mediante o envio de carta registada ao Primeiro Outorgante nesse sentido.', 10, 'F1', indentChars);

  // === Cláusula 7.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 3);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 7.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addWrapped(ps, MARGIN_L, 'Serão ainda imputados ao Segundo Outorgante os custos com telecomunicações, os consumos de fotocópias e impressões e a utilização de outros serviços complementares de acordo com tabela de preços da Startup Leiria em vigor.', 10, 'F1', charsPerLine);

  // === Cláusula 8.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 6);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 8.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addWrapped(ps, MARGIN_L, '1. Os pagamentos serão realizados por Débito Direto a favor do Primeiro Outorgante, através da conta n.º (IBAN): PT50000700000049633144423, a partir do dia 15 (quinze) do mês da respetiva fatura, sendo o Segundo Outorgante avisado por escrito com antecedência mínima de 5 (cinco) dias.', 10, 'F1', indentChars);
  addBlank(ps, 4);

  checkPage(LINE_H * 3);
  addWrapped(ps, MARGIN_L, '2. Em caso de atraso de pagamento será aplicada uma taxa de juro de mora de acordo com a taxa Euribor trimestral em vigor à data.', 10, 'F1', indentChars);

  // === Cláusula 9.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 12);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX} ${ps.y} Td (${encodePdfString('Cláusula 9.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addLineR(ps, MARGIN_L, 'Este contrato poderá cessar nas seguintes situações:', 10);
  addBlank(ps, 4);

  const cessation = [
    'a) por mútuo acordo reduzido a escrito;',
    'b) por caducidade;',
    'c) no caso em que o Segundo Outorgante não se possa conformar com a revisão de montantes referida no número 5 da cláusula 6.ª;',
    'd) mediante aviso prévio de 30 (trinta) dias por parte do Segundo Outorgante;',
    'e) mediante aviso prévio de 90 (noventa) dias por parte do Primeiro Outorgante;',
    'f) por rescisão unilateral pelo Primeiro Outorgante, no caso dos meios disponibilizados não estarem a ser devidamente utilizados/rentabilizados, ou se verifiquem situações que violem claramente o interesse público, de pessoas ou de instituições;',
    'g) não pagamento pontual da remuneração mensal referida na cláusula 6.ª. Neste caso, o Primeiro Outorgante exercerá o seu direito de resolução comunicando essa sua intenção ao Segundo Outorgante num prazo não inferior a 8 (oito) dias corridos nem superior a 30 (trinta) dias corridos, para que, sem prejuízo da sua responsabilidade pela eventual mora no cumprimento, o Segundo Outorgante cumpra a sua obrigação. Esgotado o prazo fixado, o incumprimento será assumido como definitivo e a resolução do contrato produzirá os seus efeitos, sem necessidade de quaisquer outras formalidades, no primeiro dia seguinte ao termo daquele prazo.',
  ];

  for (const item of cessation) {
    checkPage(LINE_H * 4);
    addWrapped(ps, MARGIN_L + 15, item, 10, 'F1', indentChars - 3);
    addBlank(ps, 2);
  }

  // === Cláusula 10.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 8);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX - 5} ${ps.y} Td (${encodePdfString('Cláusula 10.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addWrapped(ps, MARGIN_L, '1. O presente contrato vigorará pelo período de um ano, podendo ser renovado automaticamente até ao final do período de pós-incubação, de acordo com os artigos 9.º e 10.º do regulamento da Startup Leiria, que faz parte integrante deste contrato e desde que não seja denunciado por nenhuma das partes de acordo com a cláusula de rescisão anterior.', 10, 'F1', indentChars);
  addBlank(ps, 4);

  checkPage(LINE_H * 3);
  addWrapped(ps, MARGIN_L, '2. No final do contrato, o Segundo Outorgante deverá entregar o equipamento e as instalações em estado idêntico ao que se encontrava no início do contrato salvo situações que se devam ao uso e desgaste considerados normais.', 10, 'F1', indentChars);

  // === Cláusula 11.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 4);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX - 5} ${ps.y} Td (${encodePdfString('Cláusula 11.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  addWrapped(ps, MARGIN_L, 'Ao assinar o presente contrato, o Segundo Outorgante compreende e concorda com as normas e condições de funcionamento incluídas no Regulamento do Primeiro Outorgante, que faz parte integrante deste contrato (anexo I).', 10, 'F1', charsPerLine);

  // === Cláusula 12.ª ===
  addBlank(ps, 14);
  checkPage(LINE_H * 4);
  ps.lines.push(`BT /F2 10 Tf ${clausulaX - 5} ${ps.y} Td (${encodePdfString('Cláusula 12.ª')}) Tj ET`);
  ps.y -= LINE_H + 4;
  const effectsDate = formatDate(data.startDate);
  addWrapped(ps, MARGIN_L, `O presente contrato tem efeitos a partir de ${effectsDate}.`, 10, 'F1', charsPerLine);

  // Date and signatures
  addBlank(ps, 20);
  checkPage(LINE_H * 10);
  addLineR(ps, MARGIN_L, `Leiria, ______ de _______________________ de 20____.`, 10);
  addBlank(ps, 40);
  
  // Signature blocks
  addHorizontalLine(ps, MARGIN_L, MARGIN_L + 180);
  addHorizontalLine(ps, PAGE_W - MARGIN_R - 180, PAGE_W - MARGIN_R);
  ps.y -= LINE_H;
  addLineR(ps, MARGIN_L, 'Pelo Primeiro Outorgante', 9);
  ps.lines.push(`BT /F1 9 Tf ${PAGE_W - MARGIN_R - 150} ${ps.y + LINE_H} Td (${encodePdfString('Pelo Segundo Outorgante')}) Tj ET`);

  // ========== BUILD PDF ==========
  // Object 1: Catalog
  const catalogId = addObj(b, '<< /Type /Catalog /Pages 2 0 R >>');
  
  // Reserve obj 2 for Pages (filled later)
  addObj(b, 'placeholder');

  // Font objects
  const fontRegular = addObj(b, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = addObj(b, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fontItalic = addObj(b, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  
  const resourcesDict = `<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R /F3 ${fontItalic} 0 R >> >>`;

  // Create page objects
  const pageObjIds: number[] = [];
  const totalPages = pageStreams.length;

  for (let i = 0; i < totalPages; i++) {
    const stream = pageStreams[i];
    
    // Add footer: page number and version
    const footerY = 30;
    stream.lines.push(`BT /F1 8 Tf ${PAGE_W - MARGIN_R - 60} ${footerY} Td (${encodePdfString(`PÁGINA ${i + 1} DE ${totalPages}`)}) Tj ET`);
    stream.lines.push(`BT /F1 8 Tf ${PAGE_W - MARGIN_R - 10} ${footerY - 10} Td (V9) Tj ET`);
    // Footer line
    stream.lines.push(`${PAGE_W - MARGIN_R - 70} ${footerY + 10} m ${PAGE_W - MARGIN_R} ${footerY + 10} l S`);

    const contentStr = stream.lines.join('\n');
    const contentBytes = new TextEncoder().encode(contentStr);
    
    const streamId = addObj(b, `<< /Length ${contentBytes.length} >>\nstream\n${contentStr}\nendstream`);
    const pageId = addObj(b, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${streamId} 0 R /Resources ${resourcesDict} >>`);
    pageObjIds.push(pageId);
  }

  // Update Pages object (object 2)
  const kidsStr = pageObjIds.map(id => `${id} 0 R`).join(' ');
  b.objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>\nendobj\n`;
  
  // Recalculate offsets
  let offset = header.length;
  for (let i = 0; i < b.objects.length; i++) {
    b.objectOffsets[i] = offset;
    offset += new TextEncoder().encode(b.objects[i]).length;
  }

  // Build final PDF
  const body = b.objects.join('');
  const xrefOffset = new TextEncoder().encode(header + body).length;
  
  let xref = `xref\n0 ${b.objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of b.objectOffsets) {
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  
  const trailer = `trailer\n<< /Size ${b.objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  
  const pdfStr = header + body + xref + trailer;
  return new TextEncoder().encode(pdfStr);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req)
  }

  try {
    const corsHeaders = getCorsHeaders(req)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const token = authHeader.replace('Bearer ', '')
    const isInternalServiceCall = token === supabaseKey
    let user: { id: string } | null = null

    if (!isInternalServiceCall) {
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token)
      if (userError || !authUser) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      user = authUser
    }

    const { contractId } = await req.json()
    if (!contractId) {
      return new Response(JSON.stringify({ error: 'contractId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch contract with all related data
    const { data: contract, error: contractError } = await supabase
      .from('startup_contracts')
      .select(`
        *,
        workspace:workspaces(id, startup:startups(name, nif, main_contact_name, main_contact_email, description, website)),
        incubation_type:incubation_types(name, equity_percentage, is_virtual),
        building:buildings(name, code, address, city)
      `)
      .eq('id', contractId)
      .single()

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authorization: caller must be staff (admin/consultor/backoffice) OR an
    // active member of the contract's workspace. Prevents any authenticated
    // user from downloading another startup's contract PDF by supplying its ID.
    if (!isInternalServiceCall) {
      const { data: staffRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
      const isStaff = (staffRoles ?? []).some((r: { role: string }) =>
        r.role === 'admin' || r.role === 'consultor' || r.role === 'backoffice'
      )
      let authorized = isStaff
      if (!authorized && contract.workspace_id) {
        const { data: membership } = await supabase
          .from('workspace_users')
          .select('user_id')
          .eq('workspace_id', contract.workspace_id)
          .eq('user_id', user!.id)
          .maybeSingle()
        authorized = !!membership
      }
      if (!authorized) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }


    // Fetch active discounts
    const { data: discounts } = await supabase
      .from('contract_discounts')
      .select('*')
      .eq('contract_id', contractId)
      .lte('start_date', new Date().toISOString())
      .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`)

    const maxDiscount = discounts?.reduce((max, d) => Math.max(max, d.discount_percentage), 0) || 0
    const effectiveFee = contract.monthly_fee * (1 - maxDiscount / 100)

    const startup = contract.workspace?.startup
    const building = contract.building
    const incType = contract.incubation_type

    const contractData: ContractData = {
      contractNumber: contract.contract_number,
      startupName: startup?.name || 'N/A',
      startupDescription: startup?.description || null,
      nif: startup?.nif || null,
      contactName: startup?.main_contact_name || null,
      contactEmail: startup?.main_contact_email || null,
      address: building ? `${building.address || ''}, ${building.city || 'Leiria'}` : null,
      incubationType: incType?.name || 'Standard',
      isVirtual: incType?.is_virtual ?? true,
      buildingName: building?.name || null,
      buildingAddress: building?.address || null,
      squareMeters: contract.square_meters,
      monthlyFee: contract.monthly_fee || 0,
      currency: contract.currency || 'EUR',
      discountPercentage: contract.discount_percentage || maxDiscount,
      discountMonths: 6,
      effectiveFee,
      equityPercentage: incType?.equity_percentage || contract.equity_percentage,
      startDate: contract.start_date,
      endDate: contract.end_date,
      projectName: startup?.name || null,
    }

    // Generate PDF bytes
    const pdfBytes = generateContractPdf(contractData)

    // Store the generated document
    const fileName = `contract_${contract.contract_number || contractId.slice(0, 8)}_${Date.now()}.pdf`
    
    const { error: uploadError } = await supabase.storage
      .from('contract-documents')
      .upload(`generated/${fileName}`, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
    }

    // Update contract with document URL + pricing snapshot
    const documentPath = `generated/${fileName}`
    const pricingSnapshot = {
      monthly_fee: contractData.monthlyFee,
      effective_fee: contractData.effectiveFee,
      discount_percentage: contractData.discountPercentage,
      discount_months: contractData.discountMonths,
      incubation_type: contractData.incubationType,
      is_virtual: contractData.isVirtual,
      square_meters: contractData.squareMeters,
      building: contractData.buildingName,
      currency: contractData.currency,
      snapshot_date: new Date().toISOString(),
      regulation_version: 'V11-REG-2026',
      contract_template_version: 'V9',
    }
    await supabase
      .from('startup_contracts')
      .update({ 
        document_url: documentPath,
        regulation_version: 'V11-REG-2026',
        contract_template_version: 'V9',
        pricing_snapshot_json: pricingSnapshot,
      })
      .eq('id', contractId)

    // Log direct user-initiated generation. Internal public-token generation is
    // already mediated by public-contract-onboarding and has no authenticated user.
    if (user) {
      await supabase.from('activity_log').insert({
        user_id: user.id,
        entity_type: 'contract',
        entity_id: contractId,
        action: 'pdf_generated',
        workspace_id: contract.workspace_id,
        metadata: { document_path: documentPath },
      })
    }

    // Convert to base64 for response
    let binary = '';
    for (let i = 0; i < pdfBytes.length; i++) {
      binary += String.fromCharCode(pdfBytes[i]);
    }
    const pdfBase64 = btoa(binary);

    return new Response(JSON.stringify({
      success: true,
      documentBase64: pdfBase64,
      documentPath,
      fileName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const corsHeaders = getCorsHeaders(req)
    console.error('PDF generation error:', err)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
