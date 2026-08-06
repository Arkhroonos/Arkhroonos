/** Petites aides d'affichage terminal : couleurs ANSI, jauges, sparklines. */

export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  clearScreen: '\x1b[2J\x1b[H',
  home: '\x1b[H',
  clearBelow: '\x1b[0J',
  clearLine: '\x1b[K',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

/** Normalise un RSSI (dBm) sur [0, 1] pour la plage utile [-100, -40]. */
export function normalizeRssi(rssi: number): number {
  return Math.max(0, Math.min(1, (rssi + 100) / 60));
}

/** Couleur ANSI selon la force du signal. */
export function signalColor(rssi: number): string {
  if (rssi >= -60) return ansi.green;
  if (rssi >= -80) return ansi.yellow;
  return ansi.red;
}

/** Jauge horizontale pleine/vide d'une largeur donnée. */
export function bar(
  fraction: number,
  width: number,
  filledChar = '█',
  emptyChar = '░',
): string {
  const f = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(f * width);
  return filledChar.repeat(filled) + emptyChar.repeat(Math.max(0, width - filled));
}

const SPARK = '▁▂▃▄▅▆▇█';

/** Mini-graphe unicode de l'historique RSSI (le plus récent à droite). */
export function sparkline(values: number[], width: number): string {
  if (values.length === 0) return '';
  const slice = values.slice(-width);
  return slice
    .map((v) => {
      const idx = Math.round(normalizeRssi(v) * (SPARK.length - 1));
      return SPARK[Math.max(0, Math.min(SPARK.length - 1, idx))];
    })
    .join('');
}

/** Tronque ou complète une chaîne (sans codes ANSI) à une largeur fixe. */
export function fit(text: string, width: number): string {
  if (text.length > width) return text.slice(0, width - 1) + '…';
  return text.padEnd(width);
}
