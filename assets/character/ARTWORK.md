# Character artwork

`expressions.webp` is stylized original comic artwork created from an authorized portrait reference provided by the repository owner. The source photograph is not included in the game or this repository.

The character features consistent facial proportions, brown skin, swept-up dark hair, strong eyebrows, a small moustache, short beard, and a maroon collared zip sweatshirt with no lettering. It is a stylized illustration rather than a photographic likeness.

## Sprite layout

`expressions.webp` is **1278 × 1230 pixels, RGBA WebP**, with alpha transparency. It uses two columns and two rows; each cell is 639 × 615 pixels.

| Cell | Expression | Game use |
| --- | --- | --- |
| Top left | Neutral | Idle portrait |
| Top right | Eyes shut, “ah” mouth | Flinch with recoil toward screen right |
| Bottom left | One-eye squint, puckered lips | Flinch with recoil toward screen left |
| Bottom right | Dazed/surprised, open mouth | Strong-hit reaction |

The rendering code selects a cell, adds directional movement and temporary cheek blush, then returns to neutral. Cheek and face geometry is defined in `character.js` at the project root. No external image service or AI request is used during gameplay.

Version 1.1 adds canvas-drawn comic eye overlays on the surprised sprite. Repeated hits build the eye extension and dizzy stars; elapsed time restores the expression. Eye sockets are configured in `character.js`; `reactions.js` renders the animation and supports a static reduced-motion variant.

## Rights

This character artwork is separate from the MIT code license (`LICENSE`) and the third-party CC0 audio licenses listed in `CREDITS.md`. All likeness rights remain with the repository owner.
