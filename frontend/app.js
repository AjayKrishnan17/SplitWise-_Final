const API_BASE = "https://splitwise-final-tcjj.onrender.com/api";

class SplitWiseApp {
  constructor() {
    this.friends  = [];
    this.expenses = [];
    this.roomCode = null;
  }

  // ── Boot ────────────────────────────────────────────────────────────────────

  start() {
    const form = document.getElementById("roomForm");
    if (form) form.addEventListener("submit", e => this.enterRoom(e));
  }

  async enterRoom(e) {
    e.preventDefault();
    const input = document.getElementById("roomCodeInput");
    const code  = input.value.trim().toUpperCase();

    if (!code || code.length < 2) {
      alert("Please enter a valid room code!");
      return;
    }

    this.roomCode = code;

    // switch screens
    document.getElementById("roomScreen").style.display    = "none";
    document.getElementById("appContainer").style.display  = "block";
    document.getElementById("currentRoomCode").textContent = code;

    this.bindEvents();
    this.setStatus("🔄 Loading...");
    await this.loadData();
    this.setStatus(`✅ Room: ${this.roomCode}`);
    this.render();
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  bindEvents() {
    document.getElementById("expenseForm")
      ?.addEventListener("submit", e => this.addExpense(e));

    document.getElementById("friendForm")
      ?.addEventListener("submit", e => this.addFriend(e));

    document.getElementById("addFriendBtn")
      ?.addEventListener("click", () => this.showModal());

    document.getElementById("leaveRoomBtn")
      ?.addEventListener("click", () => this.leaveRoom());

    document.querySelectorAll(".modal-close").forEach(btn =>
      btn.addEventListener("click", () => this.hideModal())
    );

    const modal = document.getElementById("friendModal");
    if (modal) {
      modal.addEventListener("click", e => {
        if (e.target === modal) this.hideModal();
      });
    }

    document.getElementById("friendsList")
      ?.addEventListener("click", e => {
        const del = e.target.closest("[data-action='delete-friend']");
        if (del) { this.deleteFriend(del.dataset.name); return; }

        const item = e.target.closest(".friend-item");
        if (item?.dataset.name) this.toggleSelect(item.dataset.name);
      });
  }

  leaveRoom() {
    this.roomCode = null;
    this.friends  = [];
    this.expenses = [];
    document.getElementById("appContainer").style.display = "none";
    document.getElementById("roomScreen").style.display   = "flex";
    document.getElementById("roomCodeInput").value        = "";
  }

  // ── API helpers ─────────────────────────────────────────────────────────────

  async get(path) {
    const res = await fetch(`${API_BASE}${path}&roomCode=${this.roomCode}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...body, roomCode: this.roomCode })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  }

  async del(path) {
    const res = await fetch(`${API_BASE}${path}&roomCode=${this.roomCode}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  async loadData() {
    try {
      const data = await this.get(`/data?x=1`);
      this.friends  = (data.friends  || []).map(f => typeof f === "string" ? f : f.name).filter(Boolean);
      this.expenses = (data.expenses || []).map(ex => ({
        id:           ex.id || "",
        description:  ex.description || "",
        amount:       Number(ex.amount) || 0,
        paidBy:       ex.paidBy || "",
        participants: Array.isArray(ex.participants) ? ex.participants : [],
        date:         ex.date || new Date().toISOString()
      }));
    } catch (err) {
      console.error("loadData error:", err.message);
      this.friends  = [];
      this.expenses = [];
    }
  }

  // ── Friends ─────────────────────────────────────────────────────────────────

  async addFriend(e) {
    e.preventDefault();
    const input = document.getElementById("friendName");
    const name  = input.value.trim();

    if (!name) { alert("Enter a name!"); return; }
    if (this.friends.some(f => f.toLowerCase() === name.toLowerCase())) {
      alert("Friend already exists in this room!"); return;
    }

    try {
      await this.post("/friends", { name });
      this.hideModal();
      document.getElementById("friendForm").reset();
      await this.loadData();
      this.render();
    } catch (err) {
      alert("Failed to add friend: " + err.message);
    }
  }

  async deleteFriend(name) {
    if (!confirm(`Remove ${name}?`)) return;
    try {
      await this.del(`/friends/${encodeURIComponent(name)}?x=1`);
      await this.loadData();
      this.render();
    } catch (err) {
      alert("Failed to delete: " + err.message);
    }
  }

  toggleSelect(name) {
    const el = [...document.querySelectorAll(".friend-item")]
      .find(i => i.dataset.name === name);
    el?.classList.toggle("selected");
  }

  selectedFriends() {
    return [...document.querySelectorAll(".friend-item.selected")]
      .map(i => i.dataset.name).filter(Boolean);
  }

  // ── Expenses ────────────────────────────────────────────────────────────────

  async addExpense(e) {
    e.preventDefault();
    const desc     = document.getElementById("expenseDesc").value.trim();
    const amount   = parseFloat(document.getElementById("expenseAmount").value);
    const paidBy   = document.getElementById("paidBy").value;
    const selected = this.selectedFriends();

    if (!desc || !Number.isFinite(amount) || amount <= 0 || !paidBy || selected.length === 0) {
      alert("Please fill all fields and select at least one friend!"); return;
    }

    try {
      await this.post("/expenses", { description: desc, amount, paidBy, participants: selected });
      document.getElementById("expenseForm").reset();
      document.querySelectorAll(".friend-item.selected")
        .forEach(i => i.classList.remove("selected"));
      await this.loadData();
      this.render();
    } catch (err) {
      alert("Failed to add expense: " + err.message);
    }
  }

  // ── Balances ────────────────────────────────────────────────────────────────

  calcBalances() {
    const b = {};
    this.friends.forEach(f => b[f] = 0);
    this.expenses.forEach(ex => {
      const parts = (ex.participants || []).filter(Boolean);
      if (!parts.length || !ex.paidBy) return;
      if (!(ex.paidBy in b)) b[ex.paidBy] = 0;
      parts.forEach(p => { if (!(p in b)) b[p] = 0; });
      const share = ex.amount / parts.length;
      b[ex.paidBy] += ex.amount;
      parts.forEach(p => b[p] -= share);
    });
    return b;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  render() {
    this.renderFriends();
    this.renderPaidBy();
    this.renderExpenses();
    this.renderBalances();
  }

  esc(v) {
    return String(v)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  money(n) {
    return new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR" }).format(n || 0);
  }

  renderFriends() {
    const c = document.getElementById("friendsList");
    if (!c) return;
    if (!this.friends.length) {
      c.innerHTML = `<div style="text-align:center;padding:40px;color:#666;">
        <i class="fas fa-users" style="font-size:3rem;opacity:0.4;display:block;margin-bottom:12px;"></i>
        No friends yet. Add some!
      </div>`; return;
    }
    c.innerHTML = this.friends.map(f => `
      <div class="friend-item" data-name="${this.esc(f)}">
        <span>${this.esc(f)}</span>
        <button type="button" class="delete-btn" data-action="delete-friend" data-name="${this.esc(f)}">
          <i class="fas fa-trash"></i>
        </button>
      </div>`).join("");
  }

  renderPaidBy() {
    const s = document.getElementById("paidBy");
    if (!s) return;
    s.innerHTML = '<option value="">Choose who paid...</option>' +
      this.friends.map(f => `<option value="${this.esc(f)}">${this.esc(f)}</option>`).join("");
  }

  renderExpenses() {
    const c = document.getElementById("expensesList");
    if (!c) return;
    const recent = this.expenses.slice(0, 5);
    if (!recent.length) {
      c.innerHTML = `<div style="text-align:center;padding:40px;color:#666;">
        <i class="fas fa-receipt" style="font-size:3rem;opacity:0.4;display:block;margin-bottom:12px;"></i>
        No expenses yet!
      </div>`; return;
    }
    c.innerHTML = recent.map(ex => `
      <div class="expense-item">
        <div class="expense-info">
          <div class="expense-desc">${this.esc(ex.description)}</div>
          <div class="expense-meta">
            Paid by <strong>${this.esc(ex.paidBy)}</strong>
            · ${ex.participants.length} people
            · ${ex.date ? new Date(ex.date).toLocaleDateString() : ""}
          </div>
        </div>
        <div class="expense-amount">${this.money(ex.amount)}</div>
      </div>`).join("");
  }

  renderBalances() {
    const c = document.getElementById("balanceList");
    if (!c) return;
    const entries = Object.entries(this.calcBalances());
    if (!entries.length) {
      c.innerHTML = `<div style="text-align:center;padding:24px;color:#666;">No balances yet.</div>`;
      return;
    }
    c.innerHTML = entries.map(([name, bal]) => {
      const pos = bal >= 0;
      return `<div class="balance-item ${pos ? "balance-positive" : "balance-negative"}">
        <span>${this.esc(name)}</span>
        <strong>${pos ? "+" : ""}${this.money(bal)}</strong>
      </div>`;
    }).join("");
  }

  // ── Modal ────────────────────────────────────────────────────────────────────

  showModal() {
    document.getElementById("friendModal").style.display = "flex";
    document.getElementById("friendName").focus();
  }

  hideModal() {
    document.getElementById("friendModal").style.display = "none";
    document.getElementById("friendForm").reset();
  }

  setStatus(msg) {
    const el = document.getElementById("status");
    if (el) el.textContent = msg;
  }
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  window.app = new SplitWiseApp();
  window.app.start();
});
