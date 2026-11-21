/** Sprite-sheet metadata. The source photograph is intentionally not bundled. */
export const character = {
  name: 'The Challenger',
  image: './assets/character/expressions.webp',
  columns: 2,
  rows: 2,
  width: 440,
  pivot: { x: 0.53, y: 0.46 },
  face: { rx: 100, ry: 125 },
  // Eye sockets in the surprised sprite, relative to the shared face pivot.
  eyes: [
    { x: -49, y: -44, rx: 23, ry: 16, skin: '#c98d62' },
    { x: 23, y: -44, rx: 23, ry: 16, skin: '#d99c6d' },
  ],
  cheeks: {
    left: { x: -61, y: 24, rx: 30, ry: 34 },
    right: { x: 55, y: 24, rx: 30, ry: 34 },
  },
};
