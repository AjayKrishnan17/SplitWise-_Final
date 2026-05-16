class SplitWiseApp {
    constructor() {
        this.friends = [];
        this.expenses = [];
        this.API_BASE = "http://localhost:3000/api";
        this.init();
    }

    async init() {
        this.updateStatus("🔄 Loading from MongoDB...");
        await this.loadData();
        this.bindEvents();
        this.updateStatus(`✅ Ready - ${this.friends.length} friends`);
        this.render();
    }

    bindEvents() {
        const expenseForm = document.getElementById("expenseForm");
        const friendForm = document.getElementById("friendForm");
        const addFriendBtn = document.getElementById("addFriendBtn");
        const friendModal = document.getElementById("friendModal");
        const friendsList = document.getElementById("friendsList");

        if (expenseForm) {
            expenseForm.addEventListener("submit", (e) => this.addExpense(e));
        }

        if (friendForm) {
            friendForm.addEventListener("submit", (e) => this.addFriend(e));
        }

        if (addFriendBtn) {
            addFriendBtn.addEventListener("click", () => this.showModal());
        }

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
                    const name = deleteBtn.dataset.name;
                    this.deleteFriend(name);
                    return;
                }

                const item = e.target.closest(".friend-item");
                if (item && item.dataset.name) {
                    this.toggleFriendSelection(item.dataset.name);
                }
            });
        }
    }

    async apiRequest(endpoint, options = {}) {
        const response = await fetch(`${this.API_BASE}${endpoint}`, {
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            },
            ...options
        });

        if (!response.ok) {
            let error = {};
            try {
                error = await response.json();
            } catch (_) {}
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    normalizeFriends(input = []) {
        const names = input
            .map((friend) => {
                if (typeof friend === "string") return friend.trim();
                if (friend && typeof friend === "object") return String(friend.name || "").trim();
                return "";
            })
            .filter(Boolean);

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
            const data = await this.apiRequest("/data");

            this.friends = this.normalizeFriends(data.friends || []);
            this.expenses = this.normalizeExpenses(data.expenses || []);

            this.saveLocalBackup();
        } catch (error) {
            console.log("Using localStorage fallback");

            try {
                this.friends = this.normalizeFriends(
                    JSON.parse(localStorage.getItem("splitwiseFriends")) || []
                );

                this.expenses = this.normalizeExpenses(
                    JSON.parse(localStorage.getItem("splitwiseExpenses")) || []
                );
            } catch (_) {
                this.friends = [];
                this.expenses = [];
            }
        }
    }

    saveLocalBackup() {
        localStorage.setItem("splitwiseFriends", JSON.stringify(this.friends));
        localStorage.setItem("splitwiseExpenses", JSON.stringify(this.expenses));
    }

    updateStatus(message) {
        const statusEl = document.getElementById("status");
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    escapeHTML(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    formatMoney(amount) {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR"
        }).format(amount || 0);
    }

    async addFriend(e) {
        e.preventDefault();

        const input = document.getElementById("friendName");
        const name = input.value.trim();

        const alreadyExists = this.friends.some(
            (friend) => friend.toLowerCase() === name.toLowerCase()
        );

        if (!name || alreadyExists) {
            alert("Please enter a unique name!");
            return;
        }

        try {
            await this.apiRequest("/friends", {
                method: "POST",
                body: JSON.stringify({ name })
            });

            document.getElementById("friendForm").reset();
            this.hideModal();
            await this.loadData();
            this.render();
        } catch (error) {
            alert("Failed to add friend: " + error.message);
        }
    }

    getSelectedFriends() {
        return Array.from(document.querySelectorAll(".friend-item.selected"))
            .map((item) => item.dataset.name)
            .filter(Boolean);
    }

    async addExpense(e) {
        e.preventDefault();

        const desc = document.getElementById("expenseDesc").value.trim();
        const amount = parseFloat(document.getElementById("expenseAmount").value);
        const paidBy = document.getElementById("paidBy").value;
        const selectedFriends = this.getSelectedFriends();

        if (
            !desc ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            !paidBy ||
            selectedFriends.length === 0
        ) {
            alert("Please fill all fields correctly and select at least one friend!");
            return;
        }

        if (!this.friends.includes(paidBy)) {
            alert("Please choose a valid payer.");
            return;
        }

        try {
            await this.apiRequest("/expenses", {
                method: "POST",
                body: JSON.stringify({
                    description: desc,
                    amount,
                    paidBy,
                    participants: selectedFriends
                })
            });

            document.getElementById("expenseForm").reset();
            document.querySelectorAll(".friend-item.selected")
                .forEach((item) => item.classList.remove("selected"));

            await this.loadData();
            this.render();
        } catch (error) {
            alert("Failed to add expense: " + error.message);
        }
    }

    async deleteFriend(name) {
        if (!name) return;
        if (!confirm(`Remove ${name}?`)) return;

        try {
            await this.apiRequest(`/friends/${encodeURIComponent(name)}`, {
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

        if (friendItem) {
            friendItem.classList.toggle("selected");
        }
    }

    calculateBalances() {
        const balances = {};

        this.friends.forEach((friend) => {
            balances[friend] = 0;
        });

        this.expenses.forEach((expense) => {
            const participants = Array.isArray(expense.participants)
                ? expense.participants.filter(Boolean)
                : [];

            if (!participants.length || !expense.paidBy) return;

            if (!(expense.paidBy in balances)) {
                balances[expense.paidBy] = 0;
            }

            participants.forEach((person) => {
                if (!(person in balances)) {
                    balances[person] = 0;
                }
            });

            const share = expense.amount / participants.length;
            balances[expense.paidBy] += expense.amount;

            participants.forEach((participant) => {
                balances[participant] -= share;
            });
        });

        return balances;
    }

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
            container.innerHTML = `
                <div style="text-align:center;padding:40px;color:#666;">
                    <i class="fas fa-users" style="font-size:3rem;margin-bottom:16px;opacity:0.5;"></i>
                    <p>No friends yet. Add some to get started!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.friends.map((friend) => `
            <div class="friend-item" data-name="${this.escapeHTML(friend)}">
                <span>${this.escapeHTML(friend)}</span>
                <button
                    type="button"
                    class="delete-btn"
                    data-action="delete-friend"
                    data-name="${this.escapeHTML(friend)}"
                    aria-label="Delete ${this.escapeHTML(friend)}"
                >
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
            container.innerHTML = `
                <div style="text-align:center;padding:40px;color:#666;">
                    <i class="fas fa-receipt" style="font-size:3rem;margin-bottom:16px;opacity:0.5;"></i>
                    <p>No expenses yet. Add your first one!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recent.map((expense) => {
            const date = expense.date ? new Date(expense.date).toLocaleDateString() : "";
            const peopleCount = expense.participants?.length || 0;

            return `
                <div class="expense-item">
                    <div class="expense-info">
                        <div class="expense-desc">${this.escapeHTML(expense.description)}</div>
                        <div class="expense-meta">
                            Paid by <strong>${this.escapeHTML(expense.paidBy)}</strong>
                            • ${peopleCount} people
                            • ${date}
                        </div>
                    </div>
                    <div class="expense-amount">
                        ${this.formatMoney(expense.amount)}
                    </div>
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
            container.innerHTML = `
                <div style="text-align:center;padding:24px;color:#666;">
                    No balances to show yet.
                </div>
            `;
            return;
        }

        container.innerHTML = entries.map(([name, balance]) => {
            const isPositive = balance > 0;
            const sign = isPositive ? "+" : "-";

            return `
                <div class="balance-item ${isPositive ? "balance-positive" : "balance-negative"}">
                    <span>${this.escapeHTML(name)}</span>
                    <strong>${sign}${this.formatMoney(Math.abs(balance))}</strong>
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