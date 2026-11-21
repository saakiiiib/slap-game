# Natural slapping hand — version 1.3

`slapping-hand-v2.webp` is original, transparent RGBA WebP artwork (`1024 × 1536` pixels). The generation specification is saved in `PROMPT-v2.txt`.

The back of a brown hand faces the player, so its palm faces the character. Fingernails, knuckles, and a continuous painted forearm provide a natural swing silhouette. The image is mirrored for opposite directions, with the contact anchor at normalized `(0.5, 0.30)`.

`hand.js` provides approach, contact, follow-through, and exit poses; `slap-timing.js` schedules the single contact. The renderer preserves the hand's proportions and stretches only the lower painted forearm slice lengthwise to continue offstage, with an exact shared seam. All media is bundled locally and no image service is used during gameplay.
