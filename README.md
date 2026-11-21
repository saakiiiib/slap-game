# Slap Game

**[Play the game](https://saakiiiib.github.io/slap-game/)**

A free browser arcade game with a photo-inspired comic character, swipe power, cheek targets, sound reactions, and a downloadable score card. Everything runs locally in the browser using HTML, CSS, JavaScript, Canvas, and Web Audio. No build, paid assets, backend, or runtime AI/API requests are needed.

## Version 1.3 — natural hand and swing

The smaller hand now shows its back and knuckles, with a continuous painted forearm. A swipe or keyboard release starts a short approach; the palm reaches the cheek after 100 ms, when sound, face recoil, and scoring fire together. The hand follows through across the cheek and lowers away instead of snapping back. During charging the hand stays beside the incoming cheek. Reduced motion uses immediate, stationary contact. Pausing, changing mode, and ending a round cancel any pending hit. The 30-second clock and 250 ms shared cooldown still apply.

## Version 1.2 — visible slapping hand

Version 1.2 adds a shaded open hand that follows finger/mouse drags, strikes in the swipe direction, and pulls away after contact. Keyboard charging shows a wind-up hand too. Contact is synchronized with the existing face recoil, sound, and scoring; the hand never changes hitboxes or scoring. Reduced motion uses a short static contact pose.

## Version 1.1 — bigger comic reactions

Slaps now use clearer recorded “ah/aaah” reactions: soft, medium, and hard clips last about 0.45, 0.91, and 1.33 seconds. Vocal-forward mixing keeps the voice above the impact, smooth crossfades handle rapid hits, and the mouth stays open for the vocal's duration.

Several quick hits build a comic reaction: eyes enlarge and spring outward, with dizzy stars at full intensity. Taking a break lets the expression settle. New rounds reset the effect; pausing freezes its buildup. Reduced motion retains a static enlarged-eye expression without springing or wobble. Scores and hitboxes are unchanged.

## Play locally

This repository contains the modular HTML/CSS/JavaScript source directly (no build step required). Because it uses ES modules and audio files, serve it with a local HTTP server:

Open a terminal in this folder (the one containing `index.html`) and run:

```sh
python -m http.server 8765
```

Open [http://localhost:8765/](http://localhost:8765/). On Windows, `py -m http.server 8765` also works when Python's launcher is installed. Use a local server instead of opening `index.html` directly because the game loads JavaScript modules and audio files.

## How to play

- Choose **30s arcade** or **Free practice**, then press **LET'S PLAY**.
- Swipe across the face with one finger, or drag with the primary mouse button. Faster movement at contact gives more power. A swipe hitting both cheeks counts once, using the first cheek intersected.
- Aim for the glowing teal cheek ring. A target hit switches the ring to the opposite cheek. A quick tap is a weaker, 10% power slap.
- Keyboard: focus the game canvas, use **Left / Right** to choose the on-screen cheek, then **hold Space and release** to slap. About 0.9 seconds reaches full power. The yellow marker shows your selection.
- Press **Escape** to pause or resume. Arcade also has a pause button. In practice, the **square button** finishes the session and opens results.
- Returning from another tab or window requires **BACK TO IT** or Escape; the clock stays paused until you resume.
- Use the speaker button for immediate mute. Settings includes sound, volume, and reduced motion. Audio starts after a play interaction; play remains usable if audio is unavailable.

Results show score, target accuracy, hardest slap, best combo, and slaps landed. **Save score card** downloads a PNG; **ONE MORE ROUND** starts fresh.

## Scoring

`points = (round(20 + 80 × power) + target bonus) × combo`

Power ranges from 0 to 1, so base points range from 20 to 100. The highlighted cheek adds 25 points. The first target hit is ×1; consecutive target hits within 1.5 seconds increase the multiplier up to ×5. Missing, hitting off target, or waiting longer resets the combo. An off-target face hit still earns base points; a miss earns zero. All controls share a 250 ms cooldown. Accuracy is target hits divided by accepted attempts.

Only finished **arcade** rounds can update your personal best. Scores and preferences are saved in this browser, with an in-memory fallback if storage is blocked. There is no online leaderboard; clearing browser data clears the saved record. Practice does not change the arcade best.

## Host free on GitHub Pages

GitHub Pages supports this static game for free from a public repository on GitHub Free. [GitHub's hosting documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

1. Create a public repository named `slap-game` on GitHub.
2. Upload **the contents of this folder** to the repository root on `main`, including `assets`, `.nojekyll`, and `index.html`. Keep the filenames and directory structure.
3. Open repository **Settings → Pages**. Select **Deploy from a branch**, **main**, and **/(root)**, then **Save**.
4. Wait for the Pages deployment to finish, then open the URL shown there. For that repository name it is usually `https://USERNAME.github.io/slap-game/`.

Relative asset paths support project URLs. `.nojekyll` lets Pages serve the supplied static files without Jekyll processing. [GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

Publishing through the GitHub website works independently of GitHub CLI authentication. This source folder can also be uploaded unchanged to your own Pages repository.

## Tests and credits

With Node.js installed, run `npm test` in this folder. No dependency installation is required. The tests cover game rules and gesture geometry; check touch, sound, artwork, and downloads in a browser too.

See [CREDITS.md](./CREDITS.md) for the bundled CC0 audio sources and license details. Voice clips are prerecorded effects, not the pictured person's actual voice or a voice clone. See [ARTWORK.md](./assets/character/ARTWORK.md) for character artwork details. The source photograph is not bundled.
