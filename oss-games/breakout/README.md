# js_breakout

### Play it now: https://pemmyz.github.io/js_breakout/

# 🧱 JavaScript Brick Breaker Game

A classic brick breaker game built with pure JavaScript and HTML5 Canvas. Features include adaptive paddle speed, auto-follow mode, angle-based bouncing, and a polished collision system for bricks, walls, and the paddle.

### Game
![Game 1](screenshots/game_1.png)

---

## 🎮 Features

- Responsive paddle movement and physics-based ball control
- Auto-Follow mode for paddle (toggle with `A`)
- Teleport ball to paddle with Spacebar
- Adjustable ball speed (Arrow Up/Down)
- Real-time score and speed tracking
- Win condition with brick reset after 5 seconds
- Game over screen with restart option (`N`)
- Smart collision resolution with bounce angle logic
- Fullscreen canvas rendering and high-performance game loop

---

## ⌨️ Controls

| Key            | Action                            |
|----------------|-----------------------------------|
| ← / →          | Move paddle left/right            |
| ↑ / ↓          | Increase/decrease ball speed      |
| A              | Toggle Auto-Follow mode           |
| Space          | Teleport ball to paddle           |
| N              | Start new game                    |


---

## 💡 Game Notes

- Ball avoids purely horizontal movement via angle adjustments.
- Paddle and ball speed are dynamically linked for balanced play.
- After clearing all bricks, a new game starts after a short delay.

---

## 🔧 To Do / Ideas

- Add sound effects (brick hit, bounce, game over)
- Power-ups and multiple levels
- Touch controls for mobile
- Leaderboard or high score saving

---

## 📜 License

MIT License. Feel free to use and modify!

---




