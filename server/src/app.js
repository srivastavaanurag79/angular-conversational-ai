const express = require("express");
const cors = require("cors");
const { requestContext } = require("./middleware/request-context");
const { authenticate } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/error-handler");

const authRoutes = require("./routes/auth");
const conversationRoutes = require("./routes/conversations");
const chatRoutes = require("./routes/chat");
const documentRoutes = require("./routes/documents");
const toolRoutes = require("./routes/tools");
const observabilityRoutes = require("./routes/observability");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(requestContext);
app.use(authenticate);

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/tools", toolRoutes);
app.use("/api", observabilityRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = { app };
