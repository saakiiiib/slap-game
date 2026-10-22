# Character artwork

`expressions.png` was created with the built-in image generation tool using the photograph supplied in this chat as the visual reference. The source photograph is not included in the game or this project.

The character preserves the reference's facial proportions, brown skin, thick black swept-up quiff, strong eyebrows, small moustache, short beard, and maroon collared zip sweatshirt. It is a stylized illustration rather than a promise of exact photographic likeness. Clothing lettering was omitted.

## Generation brief

This summarizes the generation instructions; it is not a verbatim prompt:

Create a polished comic-style 2×2 expression sheet of the same recognizable person from the supplied photo. Keep the face, hair, clothing, size, position, and front-facing bust framing aligned across all four cells. Use bold outlines, consistent shading, and a transparent background. Preserve the identity details listed above. Include neutral, eyes-shut “ah,” one-eye squint with puckered lips, and dazed/surprised open-mouth expressions. Include no lettering, injuries, bruises, blood, or baked-in cheek redness; the game supplies temporary comic blush and recoil at runtime.

## Sprite layout

The supplied PNG is **1278 × 1230 pixels, RGBA**, with genuine alpha transparency. It uses two columns and two rows; each cell is 639 × 615 pixels.

| Cell | Expression | Game use |
| --- | --- | --- |
| Top left | Neutral | Idle portrait |
| Top right | Eyes shut, “ah” mouth | Flinch with recoil toward screen right |
| Bottom left | One-eye squint, puckered lips | Flinch with recoil toward screen left |
| Bottom right | Dazed/surprised, open mouth | Strong-hit reaction |

The rendering code selects a cell, adds directional movement and temporary cheek blush, then returns to neutral. Cheek and face geometry is defined in `character.js` at the project root. No image service or AI request is used during gameplay.

Version 1.1 adds canvas-drawn comic eye overlays on the surprised sprite. Repeated hits build the eye extension and dizzy stars; elapsed time restores the expression. The original raster artwork is unchanged. Eye sockets are configured in `character.js`; `reactions.js` renders the animation and supports a static reduced-motion variant.

This artwork is separate from the third-party CC0 audio licenses described in the project's `CREDITS.md`. The original photograph is not relicensed by this notice.
