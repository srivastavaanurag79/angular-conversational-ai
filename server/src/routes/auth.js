const express = require("express");
const { z } = require("zod");
const { userRepo } = require("../db/repositories");
const { hashPassword, verifyPassword } = require("../auth/passwords");
const { signToken, requireAuth } = require("../middleware/auth");
const { seedUserKnowledge } = require("../db/seed");

const router = express.Router();

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2).max(80).optional()
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required")
});

const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name });

router.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();

    if (userRepo.findByEmail(email)) {
      return res.status(409).json({ message: "An account with that email already exists" });
    }

    const user = userRepo.create({
      email,
      name: body.name || email.split("@")[0],
      passwordHash: hashPassword(body.password)
    });

    await seedUserKnowledge(user.id);

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/login", (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const record = userRepo.findByEmail(body.email.toLowerCase());

    if (!record || !verifyPassword(body.password, record.password_hash)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = userRepo.findById(record.id);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
