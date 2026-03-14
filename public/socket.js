// WebSocket Client — connection management, reconnect, keepalive
class WordleSocket {
    constructor(wsUrl, token, onEvent) {
        this.baseUrl = wsUrl;
        this.token = token;
        this.onEvent = onEvent;
        this.reconnectDelay = 1000;
        this.maxDelay = 30000;
        this.pingInterval = null;
        this.ws = null;
        this.intentionalClose = false;
        this.connect();
    }

    connect() {
        const url = `${this.baseUrl}?token=${this.token}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            this.reconnectDelay = 1000;
            this.startPing();
            this.onEvent({ type: '_connected' });
        };

        this.ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                this.onEvent(msg);
            } catch (err) {
                console.error('WS parse error:', err);
            }
        };

        this.ws.onclose = () => {
            this.stopPing();
            if (!this.intentionalClose) {
                this.onEvent({ type: '_disconnected' });
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = () => {
            this.ws.close();
        };
    }

    send(type, payload = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, ...payload }));
        }
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            this.send('ping');
        }, 25000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    scheduleReconnect() {
        setTimeout(() => {
            if (!this.intentionalClose) {
                this.connect();
            }
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    }

    close() {
        this.intentionalClose = true;
        this.stopPing();
        if (this.ws) {
            this.ws.close();
        }
    }
}
