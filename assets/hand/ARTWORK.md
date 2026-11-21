# Slapping hand

`slapping-hand.png` is original artwork generated with the built-in imagegen tool. The exact generation prompt is in `PROMPT.txt` beside it. The PNG is 1024 × 1536 pixels, RGBA, with alpha transparency.

It depicts an open medium-brown palm and short forearm with comic ink outlines and shaded skin. It is not a photograph of the character's hand. The game mirrors this one sprite for opposite swipe directions and anchors its palm at the contact point.

`hand.js` draws the sprite and animates pointer following, immediate contact, follow-through, and withdrawal. The hand is hidden at rest, cleared on cancelled gestures and new rounds, and shown briefly without automatic travel in reduced motion. The original character artwork is unchanged. No image service is used during gameplay.
