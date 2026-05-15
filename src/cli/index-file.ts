/**
 * Parses a `$`-terminated index file into an array of referenced file names.
 *
 * Index files list one file name per line, terminated by a line starting with `$`.
 * Blank lines are skipped. Lines after the `$` sentinel are ignored.
 */
export function parseIndexFile(content: string): string[] {
  const files: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('$')) return files;
    if (line === '') continue;
    files.push(line);
  }

  return files;
}
