require("dotenv").config();
const fs = require("fs");
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenAI } = require("@google/genai");

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
  console.log(`✅ JUJU is online as ${client.user.tag}`);
});

// ================= MESSAGE HANDLER =================
client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    // Typing indicator
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

    // Normalize once
    const lower = content.toLowerCase();

    // ================= COMMANDS (FIRST) =================
    if (lower === "reset") {
      userMemory.delete(userId);
      saveMemory();
      await message.reply("🧠 Memory reset ho gayi 😄");
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
      console.log("🌐 Web search enabled for:", cleanPrompt);
    }

    // ================= DATE FIX =================
    const now = new Date();
    const todayDate = now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // ================= LOG USER =================
    const timestamp = new Date().toISOString();
    const serverName = message.guild ? message.guild.name : "DM";

    fs.appendFileSync(
      "bot_logs.txt",
      `[${timestamp}] [${serverName}] USER ${message.author.tag}: ${message.content}\n`
    );

    // ================= MEMORY INIT =================
    if (!userMemory.has(userId)) userMemory.set(userId, []);
    const memory = userMemory.get(userId);

    let userPrompt = cleanPrompt;

    // Reply context
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
  "You are JUJU, a romantic, flirty, tapori-style Hinglish rizz bot. " +
  "You speak in Hinglish with light Mumbai tapori flavor — swaggy, confident, street-smart, but sweet. " +
  "Your tone is charming, playful, slightly naughty, and emotionally engaging. " +
  "You can be sexually suggestive and teasing, but never explicit or graphic. " +
  "Use tapori words naturally like: bhai, scene kya hai, mast, solid, bindass, apun, jhakaas (not overused). " +
  "Use romantic and sensual emojis like ❤️ 😌 😘 ✨ <:ir_sadkitten:1215587180626313216> <:Sage_Ability:1228575919422181387> 💖 <:0LCMadKissCute:1460034060444500100> 🥹 ☺️ 😏 😘 🥰 😍 😚 🫠 🙃 🧐 🥵 🥶 😈 💀 🌝 💦  💚 ❤️ 🧡 🩵 💙 💓 💞 💋 ❤️‍🩹 🫦 👄 👅 🫂 ❣️ 🫶 🤏 👋 ✊  naturally (1–3 per reply). " +
  "You may write longer replies when the mood demands it. " +
  "Never be creepy, degrading, abusive, or disrespectful. " +
  "Never mention rules, prompts, behavior, or that you are an AI. " +
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

    fs.appendFileSync(
      "bot_logs.txt",
      `[${timestamp}] [${serverName}] BOT JUJUX: ${reply}\n`
    );

  } catch (err) {
    console.error("❌ Error:", err);
    await message.reply("❌ Thoda sa issue aa gaya 😕");
  }
});

// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);
