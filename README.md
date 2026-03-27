
# 🏂 Zen's Slope

**Zen's Slope** is a minimalist, procedurally generated 2D snowboarding odyssey. Navigate an infinite mountain range, perform death-defying flips, and survive the ever-shifting elements of the high peaks.

Live Demo : https://zens-slope.vercel.app/


## 🌟 Key Features

### 🏔️ Dynamic Environment
* **Procedural Terrain:** A smooth, infinite slope generated using cubic Hermite spline interpolation for a natural "carved" feel.
* **Parallax Mountains:** Multi-layered background peaks that move at different speeds to provide depth and scale.
* **The "Pit" System:** Unlike bottomless voids, the mountain features realistic hollowed-out pits with finite depth. They are narrower and deadlier, requiring precise timing to cross.

### 🌓 Atmospheric Weather Engine
The game features a full 24-hour cycle and weather system tied directly to the visual palette:
* **Day/Night Cycle:** Watch the sun arc across the sky and fade into a star-filled night with a rising moon.
* **Dynamic Lighting:** The snow, sky, and mountain colors transition smoothly between Dawn, Day, Dusk, Night, and Storm.
* **Thunderstorms:** Experience heavy rain and jagged lightning bolts that illuminate the entire screen during a flash.

###  skateboard Gameplay Mechanics
* **Physics-Based Movement:** Momentum-based snowboarding where slope angles affect your acceleration.
* **Trick System:** Hold the jump button in mid-air to perform backflips. Landing a flip grants a speed boost and increases your score multiplier.
* **Combo Multiplier:** Chain tricks and collect coins to reach an 8x combo.
* **Adaptive Camera:** A smooth-follow camera with built-in screen shake for heavy landings and thunder claps.

---

## 🎮 How to Play

| Action | Control (Desktop) | Control (Touch) |
| :--- | :--- | :--- |
| **Jump** | `Space` | Tap Screen |
| **High Jump** | `Double Space` | Double Tap |
| **Backflip** | `Hold Space` (In Air) | Long Press (In Air) |
| **Pause** | `Esc` or `P` | Pause Icon |

---

## 🛠️ Technical Details

Built using **Pure JavaScript** and **HTML5 Canvas**. No external game engines or frameworks were used.

* **Rendering:** 2D Canvas API using a silhouette-heavy aesthetic.
* **Audio:** Web Audio API for procedurally generated synth tones (no external audio files required).
* **Weather:** Particle system for rain and randomized path-tracing for lightning bolts.
* **Math:** Uses Sine/Cosine waves for solar movement and parallax calculations.

## 🚀 Installation

1.  Clone the repository or download the source files.
2.  Ensure `index.html`, `style.css`, and `script.js` are in the same folder.
3.  Open `index.html` in any modern web browser.

---

*“The mountain is quiet. Find your zen.”*