/**
 * Estimation de distance à partir du RSSI (Received Signal Strength Indicator).
 *
 * On utilise le modèle « log-distance path loss », classique en BLE :
 *
 *     distance = 10 ^ ((measuredPower - rssi) / (10 * n))
 *
 *  - measuredPower : RSSI théorique mesuré à 1 mètre de l'émetteur (en dBm).
 *                    Environ -59 dBm pour une balise BLE typique.
 *  - n (pathLossExponent) : facteur d'atténuation de l'environnement.
 *                    2   = espace libre, ligne de vue directe
 *                    2.5 = intérieur dégagé (valeur par défaut, bon compromis)
 *                    3-4 = intérieur encombré, murs, meubles, corps humains
 *
 * ⚠️  Le RSSI donne une distance *approximative*, pas une position. Les murs,
 *     les reflets et l'orientation de l'antenne le font varier fortement.
 */

export interface DistanceModel {
  /** RSSI de référence à 1 mètre, en dBm. */
  measuredPower: number;
  /** Exposant d'atténuation de l'environnement (n). */
  pathLossExponent: number;
}

export const DEFAULT_MODEL: DistanceModel = {
  measuredPower: -59,
  pathLossExponent: 2.5,
};

/** Convertit un RSSI (dBm) en distance estimée (mètres). */
export function estimateDistanceMeters(
  rssi: number,
  model: DistanceModel = DEFAULT_MODEL,
): number {
  if (!Number.isFinite(rssi) || rssi === 0) return NaN;
  const ratio = (model.measuredPower - rssi) / (10 * model.pathLossExponent);
  return Math.pow(10, ratio);
}

/** Formate une distance en texte lisible ("18 cm", "2.4 m", "12 m"). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1) return `${Math.round(meters * 100)} cm`;
  if (meters < 10) return `${meters.toFixed(1)} m`;
  return `${Math.round(meters)} m`;
}
