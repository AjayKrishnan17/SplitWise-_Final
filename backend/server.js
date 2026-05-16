require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helpful mongoose setting
mongoose.set("strictQuery", true);

// Schemas
const friendSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }
  },
  { timestamps: true }
);

const expenseSchema = new mongoose.Schema(
  {
    id: { type: String, default: uuidv4 },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paidBy: { type: String, required: true, trim: true },
    participants: { type: [String], default: [] },
    date: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const Friend = mongoose.model("Friend", friendSchema);
const Expense = mongoose.model("Expense", expenseSchema);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

// Get all app data
app.get("/api/data", async (req, res) => {
  try {
    const friends = await Friend.find().sort({ name: 1 });
    const expenses = await Expense.find().sort({ date: -1 });
    res.json({ friends, expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get friends
app.get("/api/friends", async (req, res) => {
  try {
    const friends = await Friend.find().sort({ name: 1 });
    res.json(friends);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add friend
app.post("/api/friends", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const friend = new Friend({ name });
    await friend.save();

    res.status(201).json(friend);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Friend already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// Delete friend
app.delete("/api/friends/:name", async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name).trim();

    const result = await Friend.deleteOne({ name });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Friend not found" });
    }

    // Remove that person from all expense participant lists
    await Expense.updateMany(
      { participants: name },
      { $pull: { participants: name } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get expenses
app.get("/api/expenses", async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add expense
app.post("/api/expenses", async (req, res) => {
  try {
    const description = String(req.body.description || "").trim();
    const amount = Number(req.body.amount);
    const paidBy = String(req.body.paidBy || "").trim();
    const participants = Array.isArray(req.body.participants)
      ? [...new Set(req.body.participants.map((p) => String(p).trim()).filter(Boolean))]
      : [];

    if (!description) {
      return res.status(400).json({ error: "Description is required" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!paidBy) {
      return res.status(400).json({ error: "paidBy is required" });
    }
    if (participants.length === 0) {
      return res.status(400).json({ error: "At least one participant is required" });
    }

    const expense = new Expense({
      description,
      amount,
      paidBy,
      participants
    });

    await expense.save();
    res.status(201).json(expense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
async function startServer() {
  try {
    console.log("Connecting to MongoDB...");
    console.log("Mongo URI loaded:", Boolean(process.env.MONGODB_URI));

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("MongoDB Connected");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB connection error:");
    console.error(err);
    process.exit(1);
  }
}

startServer();