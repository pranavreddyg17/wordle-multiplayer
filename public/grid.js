// Grid Component — tile grid with flip/shake/bounce animations

class TileGrid {
    constructor(container, wordLength = 5, maxGuesses = 6) {
        this.container = container;
        this.wordLength = wordLength;
        this.maxGuesses = maxGuesses;
        this.currentRow = 0;
        this.currentCol = 0;
        this.tiles = [];
        this.rows = [];
        this.locked = false;
        this.build();
    }

    build() {
        this.container.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'tile-grid';
        grid.style.gridTemplateColumns = `repeat(${this.wordLength}, var(--tile-size))`;

        this.tiles = [];
        this.rows = [];

        for (let r = 0; r < this.maxGuesses; r++) {
            const rowTiles = [];
            for (let c = 0; c < this.wordLength; c++) {
                const tile = document.createElement('div');
                tile.className = 'tile';
                tile.dataset.row = r;
                tile.dataset.col = c;
                grid.appendChild(tile);
                rowTiles.push(tile);
            }
            this.tiles.push(rowTiles);
            this.rows.push(rowTiles);
        }

        this.container.appendChild(grid);
        this.currentRow = 0;
        this.currentCol = 0;
    }

    addLetter(letter) {
        if (this.locked || this.currentCol >= this.wordLength || this.currentRow >= this.maxGuesses) return;
        const tile = this.tiles[this.currentRow][this.currentCol];
        tile.textContent = letter.toUpperCase();
        tile.classList.add('filled');
        this.currentCol++;
    }

    removeLetter() {
        if (this.locked || this.currentCol <= 0) return;
        this.currentCol--;
        const tile = this.tiles[this.currentRow][this.currentCol];
        tile.textContent = '';
        tile.classList.remove('filled');
    }

    getCurrentWord() {
        return this.tiles[this.currentRow]
            .map(t => t.textContent)
            .join('');
    }

    isRowFull() {
        return this.currentCol === this.wordLength;
    }

    shake() {
        // Create a wrapper for the row to animate
        const rowTiles = this.tiles[this.currentRow];
        const grid = this.container.querySelector('.tile-grid');

        // Apply shake to each tile in row
        rowTiles.forEach(t => {
            t.style.animation = 'none';
            t.offsetHeight; // trigger reflow
            t.style.animation = 'shakeRow 0.4s ease';
        });

        setTimeout(() => {
            rowTiles.forEach(t => t.style.animation = '');
        }, 500);
    }

    async revealRow(result, callback) {
        this.locked = true;
        const rowTiles = this.tiles[this.currentRow];

        for (let i = 0; i < rowTiles.length; i++) {
            const tile = rowTiles[i];
            const status = result[i].toLowerCase();

            await new Promise(resolve => {
                setTimeout(() => {
                    tile.classList.add('flip');

                    // Apply color at midpoint of flip
                    setTimeout(() => {
                        tile.classList.remove('filled');
                        tile.classList.add(status);
                    }, 225);

                    setTimeout(resolve, 400);
                }, i * 100);
            });
        }

        // Check if solved (all correct)
        const solved = result.every(r => r === 'CORRECT');
        if (solved) {
            // Bounce animation
            for (let i = 0; i < rowTiles.length; i++) {
                setTimeout(() => {
                    rowTiles[i].classList.add('bounce');
                }, i * 80 + 200);
            }
        }

        this.currentRow++;
        this.currentCol = 0;
        this.locked = false;

        if (callback) callback();
    }

    reset() {
        this.build();
    }
}

// Mini grid for reveal screen
function createMiniGrid(guesses, wordLength = 5) {
    const grid = document.createElement('div');
    grid.className = 'mini-grid';
    grid.style.gridTemplateColumns = `repeat(${wordLength}, 28px)`;

    const maxRows = 6;
    for (let r = 0; r < maxRows; r++) {
        if (r < guesses.length) {
            const guess = guesses[r];
            for (let c = 0; c < wordLength; c++) {
                const tile = document.createElement('div');
                tile.className = `mini-tile ${guess.result[c].toLowerCase()}`;
                tile.textContent = guess.word[c];
                grid.appendChild(tile);
            }
        } else {
            for (let c = 0; c < wordLength; c++) {
                const tile = document.createElement('div');
                tile.className = 'mini-tile empty';
                grid.appendChild(tile);
            }
        }
    }

    return grid;
}
