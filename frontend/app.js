class SplitWiseApp {
    constructor() {
        this.friends = [];
        this.expenses = [];
        this.API_BASE = "https://splitwise-final-tcjj.onrender.com/api"; // 🔁 Change this to your Render URL
        this.roomCode = null;
        this.init();
    }

    async init() {
        this.showRoomScreen();
    }

    // ─── Room Code Screen ───────────────────────────────────────────────

    showRoomScreen() {
        const roomScreen = document.getElementById("roomScreen");
        const appContainer = document.getElementById("appContainer");
        if (roomScreen) roomScreen.style.display = "flex";
        if (appContainer) appContainer.style.display = "none";

        const roomForm = document.getElementById("roomForm");
        if (roomForm) {
            roomForm.addEventListener("submit", (e) => this.handleRoomEntry(e));
        }
    }

    handleRoomEntry(e) {
        e.preventDefault();
        const input = document.getElementById("roomCodeInput");
        const code = input.value.trim().toUpperCase();

        if (!code || code.length < 3) {
            alert("Please enter a valid room code (at least 3 characters)!");
            return;
        }

        this.roomCode = code;
        document.getElementById("roomScreen").style.display = "none";
        document.getElementById("appContainer").style.display = "block";
        document.getElementById("currentRoomCode").textContent = code;

        this.updateStatus("🔄 Loading room data...");
        this.loadData().then(() => {
            this.bindEvents();
            this.updateStatus(`✅ Room: ${this.roomCode} — ${this.friends.length} friends`);
            this.render();
        });
    }

    // ─── Events ─────────────────────────────────────────────────────────

    bindEvents() {
        const expenseForm = document.getElementById("expenseForm");
        const friendForm = document.getElementById("friendForm");
        const addFriendBtn = document.getElementById("addFriendBtn");
        const friendModal = document.getElementById("friendModal");
        const friendsList = document.getElementById("friendsList");
        const leaveRoomBtn = document.getElementById("leaveRoomBtn");

        if (expenseForm) expenseForm.addEventListener("submit", (e) => this.addExpense(e));
        if (friendForm) friendForm.addEventListener("submit", (e) => this.addFriend(e));
        if (addFriendBtn) addFriendBtn.addEventListener("click", () => this.showModal());

        document.querySelectorAll(".modal-close").forEach((btn) => {
            btn.addEventListener("click", () => this.hideModal());
        });

        if (friendModal) {
            friendModal.addEventListener("click", (e) => {
                if (e.target === e.currentTarget) this.hideModal();
            });
        }

        if (friendsList) {
            friendsList.addEventListener("click", (e) => {
                const deleteBtn = e.target.closest("[data-action='delete-friend']");
                if (deleteBtn) {
                    this.deleteFriend(deleteBtn.dataset.name);
                    return;
                }
                const item = e.target.closest(".friend-item");
                if (item && item.dataset.name) {
                    this.toggleFriendSelection(item.dataset.name);
                }
            });
        }

        if (leaveRoomBtn) {
            leaveRoomBtn.addEventListener("click", () => {
                this.roomCode = null;
                this.friends = [];
                this.expenses = [];
                this.showRoomScreen();
            });
        }
    }

    // ─── API ─────────────────────────────────────────────────────────────

    async apiRequest(endpoint, options = {}) {
        const separator = endpoint.includes("?") ? "&" : "?";
        const url = `${this.API_BASE}${endpoint}${options.method === "GET" || !options.method ? `${separator}roomCode=${this.roomCode}` : ""}`;

        const response = await fetch(url, {
            headers: { "Content-Type": "application/json", ...(options.headers || {}) },
            ...options
        });

        if (!response.ok) {
            let error = {};
            try { error = await response.json(); } catch (_) {}
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    normalizeFriends(input = []) {
        const names = input.map((f) => {
            if (typeof f === "string") return f.trim();
            if (f && typeof f === "object") return String(f.name || "").trim();
            return "";
        }).filter(Boolean);
        return [...new Set(names)];
    }

    normalizeExpenses(input = []) {
        return input.map((expense) => ({
            id: expense?.id || "",
            description: String(expense?.description || ""),
            amount: Number(expense?.amount) || 0,
            paidBy: String(expense?.paidBy || ""),
            participants: Array.isArray(expense?.participants)
                ? [...new Set(expense.participants.map((p) => String(p).trim()).filter(Boolean))]
                : [],
            date: expense?.date || new Date().toISOString()
        }));
    }

    async loadData() {
        try {
            const data = await this.apiRequest(`/data?roomCode=${this.roomCode}`);
            this.friends = this.normalizeFriends(data.friends || []);
            this.expenses = this.normalizeExpenses(data.expenses || []);
        } catch (error) {
            console.error("Failed to load data:", error);
            this.friends = [];
            this.expenses = [];
        }
    }

    updateStatus(message) {
        const statusEl = document.getElementById("status");
        if (statusEl) statusEl.textContent = message;
    }

    escapeHTML(value) {
        return String(value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    formatMoney(amount) {
        return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount || 0);
    }

    // ─── Friends ─────────────────────────────────────────────────────────

    async addFriend(e) {
        e.preventDefault();
        const input = document.getElementById("friendName");
        const name = input.value.trim();

        const alreadyExists = this.friends.some((f) => f.toLowerCase() === name.toLowerCase());
        if (!name || alreadyExists) {
            alert("Please enter a unique name!");
            return;
        }

        try {
            await fetch(`${this.API_BASE}/friends`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, roomCode: this.roomCode })
            });

            document.getElementById("friendForm").reset();
            this.hideModal();
            await this.loadData();
            this.render();
        } catch (error) {
            alert("Failed to add friend: " + error.message);
        }
    }

    async deleteFriend(name) {
        if (!name || !confirm(`Remove ${name}?`)) return;

        try {
            await fetch(`${this.API_BASE}/friends/${encodeURIComponent(name)}?roomCode=${this.roomCode}`, {
                method: "DELETE"
            });
            await this.loadData();
            this.render();
        } catch (error) {
            alert("Failed to remove friend: " + error.message);
        }
    }

    toggleFriendSelection(friendName) {
        const friendItem = Array.from(document.querySelectorAll(".friend-item"))
            .find((item) => item.dataset.name === friendName);
        if (friendItem) friendItem.classList.toggle("selected");
    }

    getSelectedFriends() {
        return Array.from(document.querySelectorAll(".friend-item.selected"))
            .map((item) => item.dataset.name).filter(Boolean);
    }

    // ─── Expenses ─────────────────────────────────────────────────────────

    async addExpense(e) {
        e.preventDefault();

        const desc = document.getElementById("expenseDesc").value.trim();
        const amount = parseFloat(document.getElementById("expenseAmount").value);
        const paidBy = document.getElementById("paidBy").value;
        const selectedFriends = this.getSelectedFriends();

        if (!desc || !Number.isFinite(amount) || amount <= 0 || !paidBy || selectedFriends.length === 0) {
            alert("Please fill all fields correctly and select at least one friend!");
            return;
        }

        try {
            await fetch(`${this.API_BASE}/expenses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description: desc, amount, paidBy, participants: selectedFriends, roomCode: this.roomCode })
            });

            document.getElementById("expenseForm").reset();
            document.querySelectorAll(".friend-item.selected").forEach((item) => item.classList.remove("selected"));
            await this.loadData();
            this.render();
        } catch (error) {
            alert("Failed to add expense: " + error.message);
        }
    }

    // ─── Balances ─────────────────────────────────────────────────────────

    calculateBalances() {
        const balances = {};
        this.friends.forEach((f) => { balances[f] = 0; });

        this.expenses.forEach((expense) => {
            const participants = Array.isArray(expense.participants) ? expense.participants.filter(Boolean) : [];
            if (!participants.length || !expense.paidBy) return;

            if (!(expense.paidBy in balances)) balances[expense.paidBy] = 0;
            participants.forEach((p) => { if (!(p in balances)) balances[p] = 0; });

            const share = expense.amount / participants.length;
            balances[expense.paidBy] += expense.amount;
            participants.forEach((p) => { balances[p] -= share; });
        });

        return balances;
    }

    // ─── Render ──────────────────────────────────────────────────────────

    render() {
        this.renderFriends();
        this.renderPaidBySelect();
        this.renderExpenses();
        this.renderBalances();
    }

    renderFriends() {
        const container = document.getElementById("friendsList");
        if (!container) return;

        if (this.friends.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#666;"><i class="fas fa-users" style="font-size:3rem;margin-bottom:16px;opacity:0.5;"></i><p>No friends yet. Add some!</p></div>`;
            return;
        }

        container.innerHTML = this.friends.map((friend) => `
            <div class="friend-item" data-name="${this.escapeHTML(friend)}">
                <span>${this.escapeHTML(friend)}</span>
                <button type="button" class="delete-btn" data-action="delete-friend" data-name="${this.escapeHTML(friend)}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join("");
    }

    renderPaidBySelect() {
        const select = document.getElementById("paidBy");
        if (!select) return;
        select.innerHTML = '<option value="">Choose who paid...</option>';
        this.friends.forEach((friend) => {
            const option = document.createElement("option");
            option.value = friend;
            option.textContent = friend;
            select.appendChild(option);
        });
    }

    renderExpenses() {
        const container = document.getElementById("expensesList");
        if (!container) return;

        const recent = this.expenses.slice(0, 5);
        if (recent.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#666;"><i class="fas fa-receipt" style="font-size:3rem;margin-bottom:16px;opacity:0.5;"></i><p>No expenses yet!</p></div>`;
            return;
        }

        container.innerHTML = recent.map((expense) => {
            const date = expense.date ? new Date(expense.date).toLocaleDateString() : "";
            return `
                <div class="expense-item">
                    <div class="expense-info">
                        <div class="expense-desc">${this.escapeHTML(expense.description)}</div>
                        <div class="expense-meta">Paid by <strong>${this.escapeHTML(expense.paidBy)}</strong> • ${expense.participants?.length || 0} people • ${date}</div>
                    </div>
                    <div class="expense-amount">${this.formatMoney(expense.amount)}</div>
                </div>
            `;
        }).join("");
    }

    renderBalances() {
        const container = document.getElementById("balanceList");
        if (!container) return;

        const balances = this.calculateBalances();
        const entries = Object.entries(balances);

        if (entries.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:24px;color:#666;">No balances yet.</div>`;
            return;
        }

        container.innerHTML = entries.map(([name, balance]) => {
            const isPositive = balance > 0;
            return `
                <div class="balance-item ${isPositive ? "balance-positive" : "balance-negative"}">
                    <span>${this.escapeHTML(name)}</span>
                    <strong>${isPositive ? "+" : "-"}${this.formatMoney(Math.abs(balance))}</strong>
                </div>
            `;
        }).join("");
    }

    showModal() {
        const modal = document.getElementById("friendModal");
        const input = document.getElementById("friendName");
        if (modal) modal.style.display = "flex";
        if (input) input.focus();
    }

    hideModal() {
        const modal = document.getElementById("friendModal");
        const form = document.getElementById("friendForm");
        if (modal) modal.style.display = "none";
        if (form) form.reset();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.app = new SplitWiseApp();
});
