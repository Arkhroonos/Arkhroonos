#!/usr/bin/env node
import { BleScanner, Advertised } from './scanner';
import {
  DEFAULT_MODEL,
  DistanceModel,
  estimateDistanceMeters,
  formatDistance,
} from './distance';
import {
  ansi,
  bar,
  fit,
  normalizeRssi,
  signalColor,
  sparkline,
} from './ui';

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------
const ALPHA = 0.4; //   lissage exponentiel du RSSI (0 = lisse, 1 = brut)
const HISTORY = 48; //   nb d'échantillons RSSI conservés par appareil
const STALE_MS = 8000; // au-delà, un appareil disparaît de la liste de scan
const LOST_MS = 4000; //  au-delà, on considère le signal « perdu » en suivi
const PRUNE_MS = 30000; // au-delà, on oublie complètement l'appareil
const REFRESH_MS = 400; // période de rafraîchissement de l'affichage

interface DeviceRecord {
  id: string;
  name: string;
  company?: string;
  rssi: number; // dernière valeur brute
  ema: number; // valeur lissée (moyenne mobile exponentielle)
  history: number[]; // historique brut pour la sparkline / tendance
  firstSeen: number;
  lastSeen: number;
}

type Mode = 'scan' | 'track';

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------
class App {
  private scanner = new BleScanner();
  private devices = new Map<string, DeviceRecord>();
  private mode: Mode;
  private targetId: string | null = null;
  private query: string | null;
  private model: DistanceModel;
  private selectable: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastState = 'unknown';
  private message = '';

  constructor(opts: { query: string | null; model: DistanceModel }) {
    this.query = opts.query;
    this.model = opts.model;
    this.mode = opts.query ? 'track' : 'scan';
  }

  async run(): Promise<void> {
    process.stdout.write(ansi.hideCursor + ansi.clearScreen);
    this.setupInput();

    this.scanner.on('state', (s: string) => this.onState(s));
    this.scanner.on('device', (d: Advertised) => this.onDevice(d));
    this.scanner.on('error', (e: unknown) => {
      this.message = 'Erreur : ' + (e instanceof Error ? e.message : String(e));
    });
    this.scanner.on('fatal', (m: string) => this.fatal(m));

    await this.scanner.start();

    this.timer = setInterval(() => this.render(), REFRESH_MS);
    process.on('SIGINT', () => void this.quit());
    process.on('SIGTERM', () => void this.quit());
  }

  // --- Événements scanner --------------------------------------------------

  private onState(state: string): void {
    this.lastState = state;
    switch (state) {
      case 'poweredOff':
        this.message = 'Bluetooth désactivé — active-le pour lancer le scan.';
        break;
      case 'unauthorized':
        this.message =
          'Accès Bluetooth refusé — autorise le Terminal dans Réglages Système › Confidentialité et sécurité › Bluetooth.';
        break;
      case 'unsupported':
        this.message = 'Bluetooth LE non pris en charge sur cette machine.';
        break;
      case 'poweredOn':
        this.message = '';
        break;
    }
  }

  private onDevice(d: Advertised): void {
    const now = Date.now();
    let rec = this.devices.get(d.id);
    if (!rec) {
      rec = {
        id: d.id,
        name: d.name,
        company: d.company,
        rssi: d.rssi,
        ema: d.rssi,
        history: [],
        firstSeen: now,
        lastSeen: now,
      };
      this.devices.set(d.id, rec);
    }

    // On garde le meilleur nom connu (les trames ne le contiennent pas toutes).
    if (d.name && d.name !== '(sans nom)') rec.name = d.name;
    if (d.company) rec.company = d.company;

    rec.rssi = d.rssi;
    rec.ema = ALPHA * d.rssi + (1 - ALPHA) * rec.ema;
    rec.history.push(d.rssi);
    if (rec.history.length > HISTORY) rec.history.shift();
    rec.lastSeen = now;

    // Verrouillage automatique quand on cherche une cible par nom/id.
    if (this.mode === 'track' && !this.targetId && this.query) {
      const q = this.query.toLowerCase();
      if (rec.name.toLowerCase().includes(q) || rec.id.toLowerCase().includes(q)) {
        this.targetId = rec.id;
        this.message = '';
      }
    }
  }

  // --- Entrée clavier ------------------------------------------------------

  private setupInput(): void {
    const stdin = process.stdin;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', (data: string) => this.onKey(data));
  }

  private onKey(raw: string): void {
    const key = raw.toString();
    if (key === '' || key === 'q') {
      void this.quit();
      return;
    }
    if (this.mode === 'scan') {
      if (/^[1-9]$/.test(key)) {
        const id = this.selectable[parseInt(key, 10) - 1];
        if (id) {
          this.targetId = id;
          this.query = null;
          this.mode = 'track';
        }
      }
    } else if (this.mode === 'track') {
      if (key === 'b') {
        this.mode = 'scan';
        this.targetId = null;
        this.query = null;
      }
    }
  }

  // --- Rendu ---------------------------------------------------------------

  private prune(): void {
    const now = Date.now();
    for (const [id, d] of this.devices) {
      if (id === this.targetId) continue;
      if (now - d.lastSeen > PRUNE_MS) this.devices.delete(id);
    }
  }

  private render(): void {
    this.prune();
    const lines = this.mode === 'scan' ? this.renderScan() : this.renderTrack();
    const body = lines.map((l) => l + ansi.clearLine).join('\n');
    process.stdout.write(ansi.home + body + ansi.clearBelow);
  }

  private renderScan(): string[] {
    const now = Date.now();
    const lines: string[] = [];
    lines.push(
      `${ansi.bold}${ansi.cyan}📡  Localisateur Bluetooth${ansi.reset}` +
        `${ansi.dim}   ·   scan en direct${ansi.reset}`,
    );
    lines.push('');

    if (this.lastState !== 'poweredOn') {
      lines.push(
        `${ansi.yellow}${this.message || `En attente du Bluetooth… (${this.lastState})`}${ansi.reset}`,
      );
      lines.push('');
      lines.push(`${ansi.dim}q : quitter${ansi.reset}`);
      return lines;
    }

    const list = [...this.devices.values()]
      .filter((d) => now - d.lastSeen < STALE_MS)
      .sort((a, b) => b.ema - a.ema);
    this.selectable = list.slice(0, 9).map((d) => d.id);

    lines.push(
      `${ansi.dim} #   ${fit('NOM', 24)} ${'RSSI'.padStart(5)}  ${'DIST'.padEnd(7)} ${'SIGNAL'.padEnd(12)}  HISTORIQUE${ansi.reset}`,
    );

    if (list.length === 0) {
      lines.push('');
      lines.push(
        `${ansi.dim}   Aucun appareil détecté pour l'instant… approche-toi ou patiente quelques secondes.${ansi.reset}`,
      );
    }

    const maxRows = Math.max(1, (process.stdout.rows ?? 30) - 8);
    list.slice(0, maxRows).forEach((d, i) => {
      const num = i < 9 ? `${ansi.bold}${i + 1}${ansi.reset}` : ' ';
      const col = signalColor(d.ema);
      const label = d.company ? `${d.name} · ${d.company}` : d.name;
      const nameCell = fit(label, 24);
      const rssiCell = `${col}${String(Math.round(d.ema)).padStart(5)}${ansi.reset}`;
      const distCell = formatDistance(
        estimateDistanceMeters(d.ema, this.model),
      ).padEnd(7);
      const barCell = `${col}${bar(normalizeRssi(d.ema), 12)}${ansi.reset}`;
      const sparkCell = `${ansi.dim}${sparkline(d.history, 12)}${ansi.reset}`;
      lines.push(
        ` ${num}   ${nameCell} ${rssiCell}  ${distCell} ${barCell}  ${sparkCell}`,
      );
    });

    lines.push('');
    lines.push(
      `${ansi.dim}1-9 : suivre un appareil   ·   q : quitter${ansi.reset}`,
    );
    if (this.message) lines.push(`${ansi.yellow}${this.message}${ansi.reset}`);
    return lines;
  }

  private renderTrack(): string[] {
    const lines: string[] = [];
    lines.push(`${ansi.bold}${ansi.cyan}🎯  Suivi Bluetooth${ansi.reset}`);
    lines.push('');

    const rec = this.targetId ? this.devices.get(this.targetId) : undefined;
    if (!rec) {
      if (this.query) {
        lines.push(`${ansi.yellow}Recherche de « ${this.query} »…${ansi.reset}`);
        lines.push(
          `${ansi.dim}Vérifie que l'appareil est allumé, à portée et détectable.${ansi.reset}`,
        );
      } else {
        lines.push(`${ansi.yellow}Aucune cible sélectionnée.${ansi.reset}`);
      }
      lines.push('');
      lines.push(
        `${ansi.dim}b : retour au scan   ·   q : quitter${ansi.reset}`,
      );
      return lines;
    }

    const now = Date.now();
    const lost = now - rec.lastSeen > LOST_MS;
    const rssi = rec.ema;
    const col = signalColor(rssi);
    const dist = estimateDistanceMeters(rssi, this.model);

    // Tendance : compare la moyenne récente à la moyenne un peu plus ancienne.
    const recent = avg(rec.history.slice(-5));
    const older = avg(rec.history.slice(-15, -5));
    const trend =
      rec.history.length >= 10 && isFinite(recent) && isFinite(older)
        ? recent - older
        : 0;

    let trendLabel: string;
    if (lost) {
      trendLabel = `${ansi.red}⚠  signal perdu — hors de portée ?${ansi.reset}`;
    } else if (trend > 2) {
      trendLabel = `${ansi.green}▲  tu te rapproches${ansi.reset}`;
    } else if (trend < -2) {
      trendLabel = `${ansi.red}▼  tu t'éloignes${ansi.reset}`;
    } else {
      trendLabel = `${ansi.yellow}●  stable${ansi.reset}`;
    }

    lines.push(
      `${ansi.bold}${rec.name}${ansi.reset}` +
        (rec.company ? `  ${ansi.dim}(${rec.company})${ansi.reset}` : ''),
    );
    lines.push(`${ansi.dim}${rec.id}${ansi.reset}`);
    lines.push('');
    lines.push(`  ${col}${bar(normalizeRssi(rssi), 34)}${ansi.reset}`);
    lines.push('');
    lines.push(
      `  Distance estimée : ${ansi.bold}${col}${lost ? '—' : formatDistance(dist)}${ansi.reset}`,
    );
    lines.push(`  Signal           : ${col}${Math.round(rssi)} dBm${ansi.reset}`);
    lines.push(`  ${trendLabel}`);
    lines.push('');
    lines.push(`  ${ansi.dim}${sparkline(rec.history, 40)}${ansi.reset}`);
    lines.push('');
    lines.push(`${ansi.dim}b : retour au scan   ·   q : quitter${ansi.reset}`);
    lines.push(
      `${ansi.dim}Astuce : marche lentement, l'estimation se lisse sur ~1 s. Les murs faussent la distance.${ansi.reset}`,
    );
    return lines;
  }

  // --- Cycle de vie --------------------------------------------------------

  private fatal(message: string): void {
    if (this.timer) clearInterval(this.timer);
    process.stdout.write(ansi.showCursor + ansi.reset + ansi.clearScreen);
    process.stderr.write(`${ansi.red}${message}${ansi.reset}\n`);
    process.exit(1);
  }

  private async quit(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    process.stdout.write(ansi.showCursor + ansi.reset + '\n');
    try {
      await this.scanner.stop();
    } catch {
      /* ignore */
    }
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.exit(0);
  }
}

function avg(a: number[]): number {
  if (a.length === 0) return NaN;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function printHelp(): void {
  const p = 'ble-locator';
  process.stdout.write(
    `${ansi.bold}Localisateur Bluetooth${ansi.reset} — trouve un appareil BLE à la puissance du signal.

${ansi.bold}USAGE${ansi.reset}
  ${p} scan                     Liste en direct les appareils BLE autour de toi
  ${p} track <nom|id>           Suit un appareil précis (radar de proximité)
  ${p} <nom>                    Raccourci équivalent à « track <nom> »

${ansi.bold}OPTIONS${ansi.reset}
  -p, --power <dBm>            RSSI de référence à 1 m (défaut : ${DEFAULT_MODEL.measuredPower})
  -n, --path-loss <n>         Exposant d'atténuation (défaut : ${DEFAULT_MODEL.pathLossExponent})
  -h, --help                  Affiche cette aide

${ansi.bold}EXEMPLES${ansi.reset}
  ${p} scan
  ${p} track AirPods
  ${p} track AirPods --path-loss 3      (intérieur encombré)

${ansi.bold}TOUCHES${ansi.reset}
  1-9   suivre l'appareil correspondant (en mode scan)
  b     revenir au scan (en mode suivi)
  q     quitter
`,
  );
}

function parseArgs(argv: string[]): { query: string | null; model: DistanceModel } {
  const args = argv.slice(2);
  const model: DistanceModel = { ...DEFAULT_MODEL };
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else if (a === '--power' || a === '-p') {
      model.measuredPower = parseFloat(args[++i]);
    } else if (a === '--path-loss' || a === '-n') {
      model.pathLossExponent = parseFloat(args[++i]);
    } else {
      positional.push(a);
    }
  }

  let query: string | null = null;
  if (positional[0] === 'track') {
    query = positional.slice(1).join(' ').trim() || null;
  } else if (positional[0] === 'scan') {
    query = null;
  } else if (positional.length > 0) {
    query = positional.join(' ').trim() || null; // raccourci : « ble-locator AirPods »
  }

  if (!Number.isFinite(model.measuredPower)) model.measuredPower = DEFAULT_MODEL.measuredPower;
  if (!Number.isFinite(model.pathLossExponent) || model.pathLossExponent <= 0) {
    model.pathLossExponent = DEFAULT_MODEL.pathLossExponent;
  }

  return { query, model };
}

async function main(): Promise<void> {
  const { query, model } = parseArgs(process.argv);
  const app = new App({ query, model });
  await app.run();
}

main().catch((err) => {
  process.stdout.write(ansi.showCursor);
  process.stderr.write(
    `Erreur fatale : ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
