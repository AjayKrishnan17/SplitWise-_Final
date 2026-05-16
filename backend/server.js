require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.set("strictQuery", true);

// ── Schemas ───────────────────────────────────────────────────────────────────

const friendSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  roomCode: { type: String, required: true, trim: true }
}, { timestamps: true });

friendSchema.index({ name: 1, roomCode: 1 }, { unique: true });

const expenseSchema = new mongoose.Schema({
  id:           { type: String, default: () => uuidv4() },
  description:  { type: String, required: true, trim: true },
  amount:       { type: Number, required: true, min: 0 },
  paidBy:       { type: String, required: true, trim: true },
  participants: { type: [String], default: [] },
  date:         { type: Date, default: Date.now },
  roomCode:     { type: String, required: true, trim: true }
}, { timestamps: true });

const Friend  = mongoose.model("Friend",  friendSchema);
const Expense = mongoose.model("Expense", expenseSchema);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => res.json({ status: "OK" }));

// Get all data for a room
app.get("/api/data", async (req, res) => {
  const roomCode = String(req.query.roomCode || "").trim().toUpperCase();
  if (!roomCode) return res.status(400).json({ error: "roomCode is required" });
  try {
    const friends  = await Friend.find({ roomCode }).sort({ name: 1 });
    const expenses = await Expense.find({ roomCode }).sort({ date: -1 });
    res.json({ friends, expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add friend
app.post("/api/friends", async (req, res) => {
  const name     = String(req.body.name     || "").trim();
  const roomCode = String(req.body.roomCode || "").trim().toUpperCase();
  if (!name)     return res.status(400).json({ error: "Name is required" });
  if (!roomCode) return res.status(400).json({ error: "roomCode is required" });
  try {
    const friend = await Friend.create({ name, roomCode });
    res.status(201).json(friend);
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ error: "Friend already exists in this room" });
    res.status(400).json({ error: err.message });
  }
});

// Delete friend
app.delete("/api/friends/:name", async (req, res) => {
  const name     = decodeURIComponent(req.params.name).trim();
  const roomCode = String(req.query.roomCode || "").trim().toUpperCase();
  if (!roomCode) return res.status(400).json({ error: "roomCode is required" });
  try {
    const result = await Friend.deleteOne({ name, roomCode });
    if (result.deletedCount === 0)
      return res.status(404).json({ error: "Friend not found" });
    await Expense.updateMany({ roomCode, participants: name }, { $pull: { participants: name } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add expense
app.post("/api/expenses", async (req, res) => {
  const description  = String(req.body.description || "").trim();
  const amount       = Number(req.body.amount);
  const paidBy       = String(req.body.paidBy || "").trim();
  const roomCode     = String(req.body.roomCode || "").trim().toUpperCase();
  const participants = Array.isArray(req.body.participants)
    ? [...new Set(req.body.participants.map(p => String(p).trim()).filter(Boolean))]
    : [];

  if (!description)                            return res.status(400).json({ error: "Description is required" });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Amount must be positive" });
  if (!paidBy)                                 return res.status(400).json({ error: "paidBy is required" });
  if (!roomCode)                               return res.status(400).json({ error: "roomCode is required" });
  if (participants.length === 0)               return res.status(400).json({ error: "At least one participant required" });

  try {
    const expense = await Expense.create({ description, amount, paidBy, participants, roomCode });
    res.status(201).json(expense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => res.status(500).json({ error: "Internal server error" }));

// ── Start ─────────────────────────────────────────────────────────────────────

async function startServer() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("MongoDB Connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

startServer();
