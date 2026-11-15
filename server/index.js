import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // large limit for resume PDFs

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Faster (lite) models first, bigger ones after
const MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

const TIMEOUT_MS = 10000;
const TOTAL_QUESTIONS = 5;

function buildSystemPrompt(role, resume) {
  return `You are a friendly but professional interviewer taking a mock interview for the role: "${role}" (fresher level, India).

Candidate's resume:
"""
${String(resume).slice(0, 6000)}
"""

Rules:
1. Start with a one-line greeting, then ask Question 1. Ask exactly ONE question at a time.
2. At least 3 of the ${TOTAL_QUESTIONS} questions MUST come from the resume (projects, skills, experience). The rest can be about the role or basic HR topics. Never invent anything that is not in the resume.
3. After the candidate answers, give short feedback (2-3 lines: what was good, what was missing), then ask the next question.
4. Total questions: ${TOTAL_QUESTIONS}. Number them like "Question 2/${TOTAL_QUESTIONS}:".
5. After the candidate answers question ${TOTAL_QUESTIONS}, do NOT ask more. Give a final report: score out of 10, 3 strengths, 3 areas to improve.
6. Always reply in English.
7. If the candidate goes off-topic, politely bring them back to the interview.
8. Keep every reply under 120 words (except the final report).`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error("Timeout"), { status: 503 })),
        ms
      )
    ),
  ]);

// Move to the next model on: busy (503), rate limit (429), model not found (404) or timeout
function shouldTryNextModel(err) {
  const msg = String(err.message || "");
  return (
    [503, 429, 404].includes(err.status) ||
    /Timeout|"code":\s*(503|429|404)|UNAVAILABLE|high demand|NOT_FOUND|RESOURCE_EXHAUSTED/i.test(msg)
  );
}

async function generateWithFallback(params, timeoutMs = TIMEOUT_MS) {
  let lastError;

  for (const model of MODELS) {
    const start = Date.now();
    try {
      console.log("Trying: " + model);
      const response = await withTimeout(
        ai.models.generateContent({ ...params, model }),
        timeoutMs
      );
      console.log("Got reply: " + model + " (" + (Date.now() - start) + "ms)");
      return response;
    } catch (err) {
      lastError = err;
      console.log(model + " failed: " + String(err.message).slice(0, 120));
      if (!shouldTryNextModel(err)) throw err;
      await sleep(300);
    }
  }

  throw lastError;
}

// ---------- Extract text from a resume (PDF) ----------
app.post("/resume", async (req, res) => {
  try {
    const { mimeType, data } = req.body;
    if (!mimeType || !data) {
      return res.status(400).json({ error: "mimeType and data are required" });
    }

    const response = await generateWithFallback(
      {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data } },
              {
                text: "Extract the key content of this resume as plain text: name, education, skills, projects (with tech used), experience, achievements. Max 400 words. No commentary.",
              },
            ],
          },
        ],
        config: { maxOutputTokens: 1200 },
      },
      25000
    );

    if (!response.text) {
      return res.status(500).json({ error: "Could not read the resume" });
    }
    res.json({ text: response.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Interview ----------
app.post("/interview", async (req, res) => {
  try {
    const { role, messages, resume } = req.body;
    console.log("\nNew request, role: " + role);

    if (!role || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "role and messages are required" });
    }
    if (!resume || !String(resume).trim()) {
      return res.status(400).json({ error: "A resume is required" });
    }

    // Gemini uses "model" instead of "assistant" as the role name
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await generateWithFallback({
      contents,
      config: {
        systemInstruction: buildSystemPrompt(role, resume),
        maxOutputTokens: 1200,
      },
    });

    if (!response.text) {
      return res.status(500).json({ error: "Empty reply, please try again" });
    }
    res.json({ reply: response.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.get("/", (req, res) => {
  res.send("Mock Interview Backend is Running!");
});
app.listen(PORT, () => console.log("Server running on port " + PORT));