import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";

const app = express();
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

let localClient = null;

wss.on("connection", (ws) => {
  console.log("[ws] local client connected");
  localClient = ws;
  ws.on("close", () => {
    console.log("[ws] local client disconnected");
    localClient = null;
  });
  ws.on("error", (err) => console.error("[ws] error:", err.message));
});

// Telegram sends webhooks here
app.post("/telegram", (req, res) => {
  res.sendStatus(200); // ack Telegram immediately
  if (localClient) {
    localClient.send(JSON.stringify(req.body));
  }
});

// Health check
app.get("/", (_req, res) => res.send("ok"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[server] listening on ${PORT}`));
