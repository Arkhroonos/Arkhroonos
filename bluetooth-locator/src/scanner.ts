import { EventEmitter } from 'events';
import { lookupCompany } from './companies';

/** Appareil BLE observé, sous une forme normalisée et exploitable. */
export interface Advertised {
  id: string;
  name: string;
  rssi: number;
  txPowerLevel?: number;
  companyId?: number;
  company?: string;
}

/** Forme minimale d'un « peripheral » noble dont on a besoin. */
interface NoblePeripheral {
  id: string;
  rssi: number;
  advertisement?: {
    localName?: string;
    txPowerLevel?: number;
    manufacturerData?: Buffer;
  };
}

/**
 * Enveloppe autour de noble (backend CoreBluetooth sur macOS).
 *
 * Le module natif n'est chargé qu'au démarrage, dans un try/catch, afin de
 * pouvoir afficher un message clair si `npm install` n'a pas été lancé.
 *
 * Événements émis :
 *   - 'state'    (state: string)        changement d'état de l'adaptateur
 *   - 'device'   (device: Advertised)   appareil détecté / mis à jour
 *   - 'scanning' ()                     le scan a démarré
 *   - 'error'    (err: unknown)         erreur non fatale
 *   - 'fatal'    (message: string)      erreur bloquante (module absent…)
 */
export class BleScanner extends EventEmitter {
  private noble: any;
  private scanning = false;

  async start(): Promise<void> {
    try {
      // Chargé dynamiquement : le binaire natif peut manquer si l'on n'a
      // pas encore installé les dépendances.
      const mod = require('@stoprocent/noble');
      this.noble = mod && mod.default ? mod.default : mod;
    } catch (err) {
      this.emit('fatal', friendlyLoadError(err));
      return;
    }

    const noble = this.noble;

    noble.on('stateChange', (state: string) => {
      this.emit('state', state);
      if (state === 'poweredOn') void this.beginScan();
    });
    noble.on('scanStop', () => {
      this.scanning = false;
    });
    noble.on('discover', (p: NoblePeripheral) => this.handleDiscover(p));

    // L'événement 'stateChange' a pu se déclencher avant l'abonnement.
    if (noble.state === 'poweredOn') void this.beginScan();
    else this.emit('state', noble.state ?? 'unknown');
  }

  private async beginScan(): Promise<void> {
    if (this.scanning) return;
    try {
      // allowDuplicates=true : indispensable pour recevoir des mises à jour
      // RSSI en continu (sans quoi un appareil n'est signalé qu'une fois).
      await this.noble.startScanningAsync([], true);
      this.scanning = true;
      this.emit('scanning');
    } catch (err) {
      this.emit('error', err);
    }
  }

  private handleDiscover(p: NoblePeripheral): void {
    const adv = p.advertisement ?? {};
    const md = adv.manufacturerData;
    let companyId: number | undefined;
    if (md && md.length >= 2) companyId = md.readUInt16LE(0);

    const name = (adv.localName ?? '').trim();

    const device: Advertised = {
      id: p.id,
      name: name || '(sans nom)',
      rssi: p.rssi,
      txPowerLevel: adv.txPowerLevel,
      companyId,
      company: companyId != null ? lookupCompany(companyId) : undefined,
    };
    this.emit('device', device);
  }

  async stop(): Promise<void> {
    if (!this.noble) return;
    try {
      await this.noble.stopScanningAsync();
    } catch {
      /* on ignore : on est en train de quitter */
    }
    this.scanning = false;
  }
}

function friendlyLoadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    'Impossible de charger le module Bluetooth « @stoprocent/noble ».\n' +
    '  • As-tu lancé « npm install » dans le dossier bluetooth-locator ?\n' +
    '  • Sur macOS, aucune compilation n\'est requise (binaires précompilés).\n' +
    '  • Vérifie aussi que le Terminal a l\'autorisation Bluetooth\n' +
    '    (Réglages Système › Confidentialité et sécurité › Bluetooth).\n' +
    'Détail technique : ' +
    msg
  );
}
