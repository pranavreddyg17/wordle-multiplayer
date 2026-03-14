// Keyboard Component — QWERTY layout with color tracking

class GameKeyboard {
    constructor(container, onKey) {
        this.container = container;
        this.onKey = onKey;
        this.keyStates = {};
        this.build();
        this.bindPhysicalKeyboard();
    }

    build() {
        this.container.innerHTML = '';
        const rows = [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
        ];

        rows.forEach(row => {
            const rowEl = document.createElement('div');
            rowEl.className = 'keyboard-row';

            row.forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'key';
                btn.dataset.key = key;

                if (key === 'ENTER' || key === '⌫') {
                    btn.classList.add('wide');
                    btn.textContent = key === '⌫' ? '⌫' : '↵';
                } else {
                    btn.textContent = key;
                }

                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleKey(key);
                });

                rowEl.appendChild(btn);
            });

            this.container.appendChild(rowEl);
        });
    }

    handleKey(key) {
        if (key === 'ENTER') {
            this.onKey('Enter');
        } else if (key === '⌫') {
            this.onKey('Backspace');
        } else {
            this.onKey(key);
        }
    }

    bindPhysicalKeyboard() {
        this._keyHandler = (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                this.onKey('Enter');
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                this.onKey('Backspace');
            } else if (/^[a-zA-Z]$/.test(e.key)) {
                this.onKey(e.key.toUpperCase());
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    unbindPhysicalKeyboard() {
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
        }
    }

    // Update key colors based on guess results
    // Priority: CORRECT > PRESENT > ABSENT
    updateKeys(word, result) {
        const priority = { 'correct': 3, 'present': 2, 'absent': 1 };

        for (let i = 0; i < word.length; i++) {
            const letter = word[i].toUpperCase();
            const status = result[i].toLowerCase();
            const current = this.keyStates[letter];

            if (!current || priority[status] > priority[current]) {
                this.keyStates[letter] = status;
                const keyEl = this.container.querySelector(`[data-key="${letter}"]`);
                if (keyEl) {
                    keyEl.classList.remove('correct', 'present', 'absent');
                    keyEl.classList.add(status);
                }
            }
        }
    }

    reset() {
        this.keyStates = {};
        this.container.querySelectorAll('.key').forEach(k => {
            k.classList.remove('correct', 'present', 'absent');
        });
    }
}
