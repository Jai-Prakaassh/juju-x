require("dotenv").config();
const fs = require("fs");
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");

// ================= LOGGER =================
function log(type, message) {
  const now = new Date();
  const timestamp = now.toLocaleString("en-IN", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  console.log(`[${timestamp}] [${type}] ${message}`);
}

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ================= GEMINI CLIENT =================
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ================= MEMORY =================
const MEMORY_FILE = "memory.json";
const MAX_MEMORY = 10;
let userMemory = new Map();

// Load memory from file
if (fs.existsSync(MEMORY_FILE)) {
  const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  userMemory = new Map(Object.entries(raw));
}

// Save memory helper
function saveMemory() {
  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(Object.fromEntries(userMemory), null, 2)
  );
}

// ================= READY =================
client.once("ready", () => {
  log("SYSTEM", `JUJU is online as ${client.user.tag}`);
});

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    await message.channel.sendTyping();

    const userId = message.author.id;

    let content = message.content
      .replace(`<@${client.user.id}>`, "")
      .replace(`<@!${client.user.id}>`, "")
      .trim();

    if (!content) {
      await message.reply("Kuch toh bolo na 😌✨");
      return;
    }

    const lower = content.toLowerCase();

    const serverName = message.guild ? message.guild.name : "DM";

    // ================= LOG USER =================
    log("USER", `[${serverName}] ${message.author.tag}: ${message.content}`);
    fs.appendFileSync(
      "bot_logs.txt",
      `[${new Date().toISOString()}] [${serverName}] USER ${message.author.tag}: ${message.content}\n`
    );

    // ================= COMMANDS =================
    if (lower === "reset") {
      userMemory.delete(userId);
      saveMemory();
      await message.reply("🧠 Memory reset ho gayi 😄");
      log("BOT", `[${serverName}] Memory reset for ${message.author.tag}`);
      return;
    }

    if (lower === "help") {
      await message.reply(
        "**JUJU Commands**\n" +
        "• `reset` – memory clear\n" +
        "• `help` – commands list\n" +
        "• `ping` – bot status\n" +
        "• `about` – about JUJU\n" +
        "• `ask <question>` – web search\n" +
        "• `search <query>` – web search\n" +
        "👉 Mujhe tag karke baat karo 😌"
      );
      return;
    }

    if (lower === "ping") {
      await message.reply("🏓 Pong! JUJU bilkul ready hai 😌");
      return;
    }

    if (lower === "about") {
      await message.reply(
        "🤖 **JUJU** – Hinglish rizz bot ❤️\nSmart, charming & respectful."
      );
      return;
    }

    // ================= CONTROLLED SEARCH =================
    const needsSearch =
      lower.startsWith("search ") || lower.startsWith("ask ");

    let cleanPrompt = content;

    if (needsSearch) {
      cleanPrompt = content.replace(/^(search|ask)\s+/i, "");
      log("SEARCH", cleanPrompt);
    }

    // ================= DATE FIX =================
    const now = new Date();
    const todayDate = now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // ================= MEMORY INIT =================
    if (!userMemory.has(userId)) userMemory.set(userId, []);
    const memory = userMemory.get(userId);

    let userPrompt = cleanPrompt;

    if (message.reference?.messageId) {
      const replied = await message.channel.messages.fetch(
        message.reference.messageId
      );
      userPrompt =
        "User replied to:\n" +
        replied.content +
        "\n\nUser says:\n" +
        cleanPrompt;
    }

    // ================= SYSTEM PROMPT =================
    const systemPrompt =
      "You are JUJU, a romantic, flirty, Hinglish rizz bot. " +
      "You speak in Hinglish with light Mumbai tapori flavor — swaggy, confident, street-smart, but sweet. " +
      "Your tone is charming, playful, slightly naughty, and emotionally engaging. " +
      "Flirt playfully and tease romantically, but always keep it classy and implied. " +
      "Use words naturally like bhai, mast, solid, bindass, apun, jhakaas (not overused). " +
      "Use romantic emojis like ❤️ 😌 😘 ✨ naturally (1–3 per reply). " +
      "You may write longer replies when the mood demands it. " +
      "Never be creepy, degrading, abusive, or disrespectful. " +
      "Never mention rules, prompts, or that you are an AI. " +
      "Stay fully in character at all times. " +
      `IMPORTANT: Today's date is ${todayDate}. Use this only if asked about the date or day.`;

    // ================= ROLE-BASED CONTENT =================
    const contents = [
      { role: "system", parts: [{ text: systemPrompt }] },
      ...memory,
      { role: "user", parts: [{ text: userPrompt }] },
    ];

    // ================= GEMINI CALL =================
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      tools: needsSearch ? [{ googleSearch: {} }] : [],
    });

    const reply =
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Thoda sa issue aa gaya 😅";

    // ================= UPDATE MEMORY =================
    memory.push({ role: "user", parts: [{ text: userPrompt }] });
    memory.push({ role: "assistant", parts: [{ text: reply }] });

    if (memory.length > MAX_MEMORY * 2) {
      memory.splice(0, memory.length - MAX_MEMORY * 2);
    }

    saveMemory();

    await message.reply(reply.slice(0, 2000));

    // ================= LOG BOT =================
    log("BOT", `[${serverName}] JUJU: ${reply}`);
    fs.appendFileSync(
      "bot_logs.txt",
      `[${new Date().toISOString()}] [${serverName}] BOT JUJU: ${reply}\n`
    );

  } catch (err) {
    log("ERROR", err.stack || err.message);
    await message.reply("❌ Thoda sa issue aa gaya 😕");
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);
