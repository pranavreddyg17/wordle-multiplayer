<div align="center">
  <h1>🟩 Multiplayer Wordle</h1>
  <p><strong>A real-time, competitive Wordle experience for 2-10 players.</strong></p>
</div>

<br />

Multiplayer Wordle is a full-stack web application that brings the classic daily word game to a real-time multiplayer setting. Create a room, share the code, and battle your friends to see who can guess the words fastest across multiple rounds.

## ✨ Features

- **Real-Time Multiplayer**: Built with WebSockets for instant state synchronization. See your opponents guess and solve the word live!
- **Customizable Rooms**: Hosts can configure the number of rounds (1-10) and round time limits (30-600 seconds).
- **Simultaneous Gameplay**: Up to 10 players guessing at the same time in private rooms.
- **Polished UI/UX**: A gorgeous dark-space theme with glassmorphism, glowing accents, and smooth animations (tile flips, shakes, and bounces).
- **Responsive Design**: Playable on desktop, tablet, and mobile browsers.
- **Fair Play**: Server-side guess validation and word dictionaries prevent cheating.

## 🚀 Quick Start (Local Development)
- Node.js (v16.0.0 or higher)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/pranavreddyg17/wordle-multiplayer.git
   cd wordle-multiplayer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser. Open multiple tabs to test the multiplayer features!

## 🏗️ Architecture

The application is built using a monolithic Node.js architecture leaning on standard web technologies:

- **Backend:** Node.js, Express, `ws` (WebSockets)
- **Frontend:** Vanilla HTML, CSS, JavaScript (No frameworks)
- **State Management:** In-memory store (Room Manager + Game Engine)
- **Real-time Comms:** Custom WebSocket protocol for broadcasting events (`room_state`, `guess_result`, `round_started`, etc.)

```text
multiplayer-wordle/
├── public/                 # Frontend assets
│   ├── index.html          # Main application structure (all screens)
│   ├── style.css           # UI design system & animations
│   ├── app.js              # State machine and controller logic
│   ├── grid.js             # Tile grid component 
│   ├── keyboard.js         # Interactive QWERTY keyboard component
│   └── socket.js           # WebSocket client wrapper
├── server/                 # Backend logic
│   ├── index.js            # Server entry point 
│   ├── gameEngine.js       # Core Wordle logic (scoring, tile colors)
│   ├── roomManager.js      # Lobby lifecycle & state store
│   ├── routes.js           # REST API for room joining/creation
│   ├── wordService.js      # Word dictionaries & validation
│   └── wsHandler.js        # WebSocket event routing & broadcasting
└── package.json            
```

## 🎮 How to Play

1. **Enter your name and click "Create Room".**
2. **Share the 8-character Room Code** with your friends.
3. They enter their name and the code, then click **"Join"**.
4. The Host configures the rounds and timer, then clicks **"Start Game"**.
5. During the round, enter 5-letter words. 
   - 🟩 **Green**: Correct letter, correct spot.
   - 🟨 **Yellow**: Correct letter, wrong spot.
   - ⬜ **Gray**: Letter not in the word.
6. The player with the most words solved in the fewest total guesses wins!
