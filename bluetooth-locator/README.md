# 📡 Localisateur Bluetooth (BLE) — macOS

Un petit outil en ligne de commande, écrit en **TypeScript / Node.js**, qui
scanne les appareils **Bluetooth Low Energy** autour de toi et t'aide à en
**localiser un** grâce à la puissance de son signal (RSSI) — façon
« tu chauffes / tu refroidis ».

Idéal pour retrouver des **AirPods**, une montre connectée, un traceur, un
casque, une enceinte… bref tout objet BLE allumé et à portée.

```
📡  Localisateur Bluetooth   ·   scan en direct

 #   NOM                       RSSI  DIST    SIGNAL        HISTORIQUE
 1   AirPods Pro · Apple        -48  20 cm   ████████░░░░  ▅▆▆▇▇▆▇█▇▇▆▇
 2   Mi Band 7                  -67  1.4 m   █████░░░░░░░  ▄▄▅▄▃▄▄▅▄▄▄▄
 3   (sans nom)                 -83  6 m     ██░░░░░░░░░░  ▂▂▁▂▂▂▁▂▂▂▂▂

1-9 : suivre un appareil   ·   q : quitter
```

---

## ✅ Prérequis

- **macOS** (le backend utilise CoreBluetooth via
  [`@stoprocent/noble`](https://github.com/stoprocent/noble) — binaires
  précompilés, **aucune compilation nécessaire**).
- **Node.js ≥ 18** (`node -v` pour vérifier).
- Autoriser l'accès Bluetooth à ton terminal (voir plus bas).

---

## 🚀 Installation

```bash
cd bluetooth-locator
npm install
npm run build
```

> La première fois que tu lances un scan, macOS demande l'autorisation
> **Bluetooth** pour ton terminal. Accepte-la, sinon rien ne sera détecté.
> Tu peux la (re)gérer dans **Réglages Système › Confidentialité et sécurité ›
> Bluetooth**.

---

## 🎮 Utilisation

### Scanner tout ce qui est autour

```bash
npm run scan
```

Affiche en direct la liste des appareils, triés du plus proche au plus
lointain, avec le RSSI, une distance estimée, une jauge de signal et un
mini-historique.

### Suivre un appareil précis (radar de proximité)

Depuis le scan, appuie sur le **chiffre** de l'appareil (`1`–`9`) pour passer
en mode suivi. Ou vise-le directement par son nom :

```bash
node dist/index.js track AirPods
```

En mode suivi, l'écran affiche une grosse jauge, la distance estimée, le RSSI
lissé et une **tendance** : `▲ tu te rapproches` / `▼ tu t'éloignes` /
`● stable`. Marche lentement dans la pièce en regardant la jauge monter : tu
finis par tomber sur l'objet.

### Sans build (mode dev)

```bash
npm run dev:scan
npm run dev -- track "Mi Band"
```

### Aide

```bash
node dist/index.js --help
```

### Touches

| Touche  | Action                                   |
| ------- | ---------------------------------------- |
| `1`–`9` | Suivre l'appareil correspondant (scan)   |
| `b`     | Revenir au scan (mode suivi)             |
| `q`     | Quitter                                  |

---

## 📏 Comment la distance est estimée

Le RSSI (puissance reçue, en dBm) est converti en distance via le modèle
classique **log-distance path loss** :

```
distance = 10 ^ ((measuredPower - rssi) / (10 · n))
```

- `measuredPower` — RSSI de référence à 1 m (défaut `-59` dBm).
- `n` — exposant d'atténuation de l'environnement (défaut `2.5`).

Tu peux calibrer selon ton environnement :

```bash
# Intérieur encombré (murs, meubles) → n plus élevé
node dist/index.js track AirPods --path-loss 3.5

# Balise dont tu connais le RSSI à 1 m
node dist/index.js track AirPods --power -55
```

---

## ⚠️ Limites (importantes)

- Le RSSI donne une **proximité approximative, pas une position** : pas de
  direction, et la valeur varie beaucoup selon les murs, les reflets et
  l'orientation de l'antenne. La méthode qui marche : **bouger** et suivre la
  tendance du signal.
- **Vie privée BLE** : iOS/iPadOS/macOS/Android randomisent régulièrement
  l'adresse Bluetooth des appareils. Un même objet peut donc apparaître sous
  plusieurs entrées au fil du temps, et le nom n'est pas toujours diffusé.
- Ne sont détectés que les appareils **BLE en mode annonce** (advertising).
  Un appareil déjà appairé/connecté à un autre hôte peut ne pas apparaître.

---

## 🧩 Structure du projet

```
bluetooth-locator/
├── src/
│   ├── index.ts       CLI + boucle d'affichage (scan / suivi)
│   ├── scanner.ts     Enveloppe autour de noble (CoreBluetooth)
│   ├── distance.ts    RSSI → distance (modèle log-distance)
│   ├── companies.ts   Identifiants fabricant Bluetooth SIG (partiel)
│   └── ui.ts          Couleurs ANSI, jauges, sparklines
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🛠️ Dépannage

| Problème                                   | Solution                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| « Accès Bluetooth refusé »                 | Réglages Système › Confidentialité et sécurité › Bluetooth → active ton terminal, puis relance.            |
| Rien ne s'affiche                          | Vérifie que le Bluetooth est activé et qu'un appareil BLE est allumé à proximité.                           |
| « Impossible de charger le module… »       | Lance `npm install` dans le dossier `bluetooth-locator`.                                                    |
| Un appareil apparaît en double             | Normal : l'adresse BLE est randomisée pour la vie privée. Suis l'entrée au signal le plus fort.            |

---

_Écrit en TypeScript, backend BLE via `@stoprocent/noble` (CoreBluetooth)._
