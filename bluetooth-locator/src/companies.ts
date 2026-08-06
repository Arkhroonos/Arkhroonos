/**
 * Correspondance partielle des identifiants fabricant Bluetooth SIG.
 *
 * Les 2 premiers octets du champ « manufacturer data » d'une trame BLE
 * contiennent le « Company Identifier » (little-endian). On en déduit la
 * marque de l'appareil quand c'est possible. Liste volontairement courte et
 * limitée aux identifiants les plus courants et fiables.
 *
 * Référence : https://www.bluetooth.com/specifications/assigned-numbers/
 */
const COMPANIES: Record<number, string> = {
  0x004c: 'Apple',
  0x0006: 'Microsoft',
  0x0075: 'Samsung',
  0x00e0: 'Google',
  0x0087: 'Garmin',
  0x0059: 'Nordic Semi',
  0x000f: 'Broadcom',
};

/** Renvoie le nom de la marque pour un Company Identifier, ou undefined. */
export function lookupCompany(id: number): string | undefined {
  return COMPANIES[id];
}
