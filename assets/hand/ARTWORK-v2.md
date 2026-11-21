# Natural slapping hand — version 1.3

`slapping-hand-v2.png` was generated with the built-in imagegen tool as original, transparent artwork. The exact prompt is saved in `PROMPT-v2.txt`. The image is 1024 × 1536 RGBA.

The back of a brown hand faces the player, so its palm faces the character. Fingernails, knuckles, and a continuous painted forearm replace the previous open palm and code-drawn arm extension. The image is mirrored for opposite directions. The contact anchor is at normalized (0.5, 0.30).

`hand.js` provides approach, contact, follow-through and exit poses; `slap-timing.js` schedules the single contact. The renderer preserves the hand's proportions and stretches only the lower painted forearm slice lengthwise to continue offstage, with an exact shared seam. All media is bundled locally and no image service is used in gameplay. This asset is not a photograph of the supplied person's hand. The original version remains beside it for source history.
