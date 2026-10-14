/**
 * Validation for imported documents. Imported files are untrusted input.
 */
export const MAX_DOCUMENT_BYTES = 300 * 1024 * 1024; // 300 MB
export const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export type ValidationError =
  | { code: 'empty'; message: string }
  | { code: 'too-large'; message: string }
  | { code: 'not-pdf'; message: string }
  | { code: 'bad-name'; message: string };

/** Checks the first bytes for the PDF signature. Many PDFs allow up to 1024 bytes of junk before "%PDF-". */
export function hasPdfSignature(head: Uint8Array): boolean {
  const limit = Math.min(head.length - PDF_MAGIC.length, 1024);
  for (let i = 0; i <= limit; i++) {
    let ok = true;
    for (let j = 0; j < PDF_MAGIC.length; j++) {
      if (head[i + j] !== PDF_MAGIC[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function validatePdfCandidate(size: number, head: Uint8Array): ValidationError | null {
  if (size <= 0) return { code: 'empty', message: 'Dosya boş' };
  if (size > MAX_DOCUMENT_BYTES) {
    return { code: 'too-large', message: `Dosya çok büyük (en fazla ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB)` };
  }
  if (!hasPdfSignature(head)) return { code: 'not-pdf', message: 'Dosya geçerli bir PDF değil (%PDF imzası yok)' };
  return null;
}

/**
 * Produces a display title from an untrusted filename. Removes path
 * separators, control characters and the extension.
 */
export function titleFromFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\.pdf$/i, '').trim();
  return cleaned.slice(0, 200) || 'Adsız doküman';
}

/**
 * Stored file names are generated from the internal id only — the original
 * filename is never used as a path component (prevents path traversal).
 */
export function storedFileName(id: string): string {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new Error('Invalid document id');
  return `${id}.pdf`;
}

/** Ensures a relative path stays inside the documents directory. */
export function isSafeRelativePath(rel: string): boolean {
  if (rel.length === 0 || rel.startsWith('/') || rel.includes('\\')) return false;
  return rel.split('/').every((seg) => seg !== '..' && seg !== '.' && seg.length > 0);
}

export function sanitizeTitle(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
