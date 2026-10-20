import {PDFDocument, type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fontData from './assembly-font.ttf?inline';

const utf8 = new TextEncoder();
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function xml(text: string): string {
  for (const char of text) {
    const point = char.codePointAt(0)!;
    if (!(point === 9 || point === 10 || point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) ||
      (point >= 0xe000 && point <= 0xfffd) || point >= 0x10000)) {
      throw new Error(`Document text contains a character XML cannot represent: U+${point.toString(16).toUpperCase()}.`);
    }
  }
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function wordParagraph(text: string, title = false): string {
  const runs = text.split(/(\r\n|\r|\n|\t)/).map(part => {
    if (part === '\t') return '<w:tab/>';
    if (/^(\r\n|\r|\n)$/.test(part)) return '<w:br/>';
    return `<w:t xml:space="preserve">${xml(part)}</w:t>`;
  }).join('');
  return `<w:p>${title ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>' : ''}<w:r>${runs}</w:r></w:p>`;
}

const crcTable = Uint32Array.from({length: 256}, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** An uncompressed ZIP with UTF-8 names, CRC32, central directory and EOCD. */
function zip(files: Record<string, string>): Uint8Array {
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0, directorySize = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = utf8.encode(path), data = utf8.encode(content), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(12, 0x0021, true); // 1980-01-01; no environment-dependent timestamp.
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(14, 0x0021, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    chunks.push(local, data);
    directory.push(central);
    directorySize += central.length;
    offset += local.length + data.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, directory.length, true);
  ev.setUint16(10, directory.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  const output = new Uint8Array(offset + directorySize + end.length);
  let cursor = 0;
  for (const chunk of [...chunks, ...directory, end]) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

/** WordprocessingML preserves Unicode, paragraph boundaries, tabs and line breaks. */
export function docx(title: string, paragraphs: string[]): Uint8Array {
  const escapedTitle = xml(title);
  return zip({
    '[Content_Types].xml': xmlHeader + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    '_rels/.rels': xmlHeader + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
    'docProps/core.xml': xmlHeader + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      `<dc:title>${escapedTitle}</dc:title><dc:creator>Satchel</dc:creator></cp:coreProperties>`,
    'word/_rels/document.xml.rels': xmlHeader + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': xmlHeader + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:keepNext/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style></w:styles>',
    'word/document.xml': xmlHeader + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      wordParagraph(title, true) + paragraphs.map(text => wordParagraph(text)).join('') +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>',
  });
}

function pdfLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const result: string[] = [];
  for (const source of text.replaceAll('\t', '    ').split(/\r\n|\r|\n/)) {
    let chars: string[] = [], width = 0, lastSpace = -1;
    for (const char of source) {
      let charWidth: number;
      try {
        charWidth = font.widthOfTextAtSize(char, size);
      } catch {
        const code = char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
        throw new Error(`PDF cannot represent U+${code} with the available font.`);
      }
      while (chars.length && width + charWidth > maxWidth) {
        const split = lastSpace >= 0 ? lastSpace + 1 : chars.length;
        result.push(chars.slice(0, split).join(''));
        chars = chars.slice(split);
        width = font.widthOfTextAtSize(chars.join(''), size);
        lastSpace = chars.lastIndexOf(' ');
      }
      chars.push(char);
      width += charWidth;
      if (char === ' ') lastSpace = chars.length - 1;
    }
    result.push(chars.join(''));
  }
  return result;
}

/** Real PDF pages using font metrics. Unsupported glyphs fail before an artifact is returned. */
export async function pdf(title: string, paragraphs: string[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const regular=await document.embedFont(Uint8Array.from(atob(fontData.slice(fontData.indexOf(',')+1)),c=>c.charCodeAt(0)),{subset:true}),bold=regular;
  const supported=new Set(regular.getCharacterSet());
  for(const char of [title,...paragraphs].join(''))if(!/[\r\n\t]/.test(char)&&!supported.has(char.codePointAt(0)!))throw new Error(`The PDF font has no glyph for ${char}. Choose a supported spelling before preparing the PDF.`);
  document.setCreationDate(new Date('2000-01-01T00:00:00Z'));
  document.setModificationDate(new Date('2000-01-01T00:00:00Z'));
  const width = 612, height = 792, margin = 54, textWidth = width - margin * 2;
  const blocks = [
    {lines: pdfLines(title, bold, 18, textWidth), font: bold, size: 18, leading: 25, gap: 12},
    ...paragraphs.map(text => ({lines: pdfLines(text, regular, 11, textWidth), font: regular, size: 11, leading: 16, gap: 8})),
  ];
  document.setTitle(title);
  document.setCreator('Satchel');
  let page = document.addPage([width, height]), y = height - margin;
  for (const block of blocks) {
    for (const line of block.lines) {
      if (y - block.leading < margin) {
        page = document.addPage([width, height]);
        y = height - margin;
      }
      y -= block.leading;
      if (line) page.drawText(line, {x: margin, y, font: block.font, size: block.size});
    }
    y -= block.gap;
  }
  return document.save({useObjectStreams: false});
}
