/** Where the full app is hosted (used when a feature is unavailable in an embedded preview). */
export const FULL_APP_URL = 'https://stepanvcelak11.github.io/Piano/';

type DownloadsApi = { save: (r: { filename: string; data: Blob }) => Promise<{ status: string }> };
type ClaudeHost = { use: (name: string) => Promise<unknown> };

/** File types a claude.ai artifact viewer lets a page save. */
const ARTIFACT_SAVE_EXTENSIONS = ['json', 'txt', 'md', 'csv', 'zip'];

function claudeHost(): ClaudeHost | null {
  const c = (window as unknown as { claude?: ClaudeHost }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

/** True when running inside a sandboxed preview (claude.ai artifact) rather than as a normal website. */
export function isEmbeddedPreview(): boolean {
  return claudeHost() !== null;
}

/** Can this environment save a file with the given extension? */
export function canSave(filename: string): boolean {
  if (!isEmbeddedPreview()) return true;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ARTIFACT_SAVE_EXTENSIONS.includes(ext);
}

export type SaveOutcome = 'saved' | 'cancelled' | 'unsupported';

/**
 * Save a generated file. Uses the native share sheet on phones (iOS "Save to Files"),
 * the host's download capability inside an embedded preview, and a download link otherwise.
 * Call it directly from a tap handler so mobile browsers treat it as user-initiated.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveOutcome> {
  const host = claudeHost();
  if (host) {
    if (!canSave(filename)) return 'unsupported';
    try {
      const downloads = (await host.use('downloads')) as DownloadsApi | null;
      if (!downloads) return 'unsupported';
      await downloads.save({ filename, data: blob });
      return 'saved';
    } catch (err) {
      return (err as { code?: string })?.code === 'declined' ? 'cancelled' : 'unsupported';
    }
  }

  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
  if (isTouch && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'saved';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to a regular download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'saved';
}

/** File-name-safe slug from a project name. */
export function slug(name: string | undefined): string {
  return (
    (name ?? 'crossover')
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 40) || 'crossover'
  );
}
