const jwt = require("jsonwebtoken");
const { config } = require("../config");
const { userRepo } = require("../db/repositories");

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.auth.jwtSecret, {
    expiresIn: config.auth.tokenTtl
  });
}

function readUser(req) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  try {
    const payload = jwt.verify(header.slice(7), config.auth.jwtSecret);
    return userRepo.findById(payload.sub) || null;
  } catch {
    return null;
  }
}

function authenticate(req, _res, next) {
  req.user = readUser(req);
  next();
}

function requireAuth(req, res, next) {
  req.user = req.user || readUser(req);
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

module.exports = { signToken, authenticate, requireAuth };
