import { useState, useRef, useEffect } from "react";
import "./App.css";

const API = "http://localhost:5000";
const TOTAL = 5;
const SITE_NAME = "AI Mock Interview";
const OWNER = ":-Rohit Prajapati";

const ROLES = [
"Java Developer",
"Software Developer",
"Backend Developer (Java/Spring Boot)",
"Full Stack Developer",
"Frontend Developer (React)",
"Data Analyst",
"Other"
];

function renderText(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function cleanForSpeech(t) {
  return t.replace(/[*#_`>]/g, " ").replace(/\s+/g, " ").trim();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

function permMsg(what, e) {
  if (e && e.name === "NotAllowedError")
    return what + " permission is blocked. Click the 🔒 icon in the address bar and choose Allow.";
  if (e && e.name === "NotFoundError")
    return what + " device not found.";
  return what + " could not be started.";
}

function Toggle({ on, onClick, icon, title, desc }) {
  return (
    <button type="button" className={"toggle" + (on ? " on" : "")} onClick={onClick}>
      <span className="ticon">{icon}</span>
      <span className="ttext">
        <b>{title}</b>
        <small>{desc}</small>
      </span>
      <span className="switch">
        <i />
      </span>
    </button>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <div className="footer-brand">
            <span className="logo sm">🎤</span> {SITE_NAME}
          </div>
          <p>
            Practice real interview questions based on your own resume, with camera
            and voice, and get instant feedback.
          </p>
        </div>
        <div>
          <h4>Features</h4>
          <ul>
            <li>Resume-based questions</li>
            <li>Camera and voice answers</li>
            <li>Instant feedback and final score</li>
          </ul>
        </div>
        <div>
          <h4>Built with</h4>
          <ul>
            <li>React + Vite</li>
            <li>Node.js + Express</li>
            <li>Google Gemini API</li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</span>
        <span>Designed and developed by <b>{OWNER}</b></span>
      </div>
    </footer>
  );
}

export default function App() {
  const [role, setRole] = useState(ROLES[0]);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [resumeStatus, setResumeStatus] = useState("idle"); // idle | reading | ready | error
  const [dragOver, setDragOver] = useState(false);

  const [camReady, setCamReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [notice, setNotice] = useState("");

  const bottomRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const baseRef = useRef("");
  const spokenRef = useRef(0);
  const noticeTimer = useRef(null);

  const showNotice = (msg) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 6000);
  };

  // ---------- auto scroll ----------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ---------- attach camera preview ----------
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [camOn, started]);

  // ---------- read the interviewer's reply aloud ----------
  useEffect(() => {
    if (!speakOn || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    if (spokenRef.current === messages.length) return;
    spokenRef.current = messages.length;
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(cleanForSpeech(last.content));
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  }, [messages, speakOn]);

  // ---------- cleanup ----------
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ---------- Resume ----------
  const handleFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isTxt = file.type === "text/plain" || name.endsWith(".txt");

    if (!isPdf && !isTxt) {
      setResumeStatus("error");
      showNotice("Only PDF or TXT resumes are supported. If you have a Word file, save it as PDF first.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setResumeStatus("error");
      showNotice("The file must be smaller than 5 MB.");
      return;
    }

    setResumeName(file.name);
    setResumeStatus("reading");
    try {
      let text = "";
      if (isPdf) {
        const data = await fileToBase64(file);
        const res = await fetch(API + "/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType: "application/pdf", data }),
        });
        const json = await res.json();
        if (!json.text) throw new Error(json.error || "empty");
        text = json.text;
      } else {
        text = await file.text();
      }
      if (!text.trim()) throw new Error("empty");
      setResumeText(text);
      setResumeStatus("ready");
    } catch (e) {
      setResumeStatus("error");
      showNotice("Could not read the resume. Is the server running? Or try a different file.");
    }
  };

  const clearResume = () => {
    setResumeText("");
    setResumeName("");
    setResumeStatus("idle");
  };

  // ---------- Camera ----------
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = s;
      s.getVideoTracks()[0].onended = () => {
        streamRef.current = null;
        setCamOn(false);
        showNotice("Camera stopped. Please enable it to continue.");
      };
      setCamOn(true);
      return true;
    } catch (e) {
      setCamOn(false);
      showNotice(permMsg("Camera", e));
      return false;
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  const allowCamera = async () => {
    if (camReady) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      setCamReady(true);
    } catch (e) {
      showNotice(permMsg("Camera", e));
    }
  };

  const allowMic = async () => {
    if (micReady) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMicReady(true);
      if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
        showNotice("Voice typing works only in Chrome or Edge. You can still type your answers.");
      }
    } catch (e) {
      showNotice(permMsg("Microphone", e));
    }
  };

  // ---------- Mic (speech to text) ----------
  const stopMic = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showNotice("Please use Chrome or Edge for voice typing.");
      return;
    }
    window.speechSynthesis?.cancel();
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = input;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput((baseRef.current + " " + text).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") showNotice(permMsg("Microphone", { name: "NotAllowedError" }));
      else if (e.error !== "no-speech" && e.error !== "aborted")
        showNotice("Mic error: " + e.error);
    };
    rec.start();
    recRef.current = rec;
    setListening(true);
  };

  const toggleListen = () => (listening ? stopMic() : startMic());

  // ---------- Interview ----------
  const callApi = async (history) => {
    setLoading(true);
    try {
      const res = await fetch(API + "/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, messages: history, resume: resumeText }),
      });
      const data = await res.json();
      const reply = data.reply || "Error: " + (data.error || "unknown");
      setMessages([...history, { role: "assistant", content: reply }]);
    } catch {
      setMessages([
        ...history,
        { role: "assistant", content: "Could not connect to the server." },
      ]);
    }
    setLoading(false);
  };

  const startInterview = async () => {
    if (missing.length > 0) {
      showNotice("Required before starting: " + missing.join(", ") + ".");
      return;
    }
    const camOk = await startCamera();
    if (!camOk) return;
    setStarted(true);
    setSpeakOn(true);
    spokenRef.current = 0;
    const first = [{ role: "user", content: "I am ready. Please start the interview." }];
    setMessages(first);
    callApi(first);
  };

  const send = () => {
    if (!input.trim() || loading || finished) return;
    if (!camOn) {
      showNotice("Camera must be on to continue the interview.");
      return;
    }
    if (listening) stopMic();
    window.speechSynthesis?.cancel();
    const updated = [...messages, { role: "user", content: input.trim() }];
    setMessages(updated);
    setInput("");
    callApi(updated);
  };

  const restart = () => {
    stopMic();
    stopCamera();
    window.speechSynthesis?.cancel();
    setStarted(false);
    setMessages([]);
    setInput("");
    setSpeakOn(false);
  };

  // ---------- progress ----------
  const lastQ = [...messages]
    .reverse()
    .map((m) => m.role === "assistant" && m.content.match(/Question\s*(\d+)\s*\/\s*\d+/i))
    .find(Boolean);
  const qNum = lastQ ? Math.min(parseInt(lastQ[1], 10), TOTAL) : 0;
  const answers = messages.filter((m) => m.role === "user").length - 1;
  const finished =
    answers >= TOTAL && !loading && messages[messages.length - 1]?.role === "assistant";
  const progress = finished ? 100 : Math.round((Math.max(qNum - 1, 0) / TOTAL) * 100);

  // ---------- requirements to start ----------
  const missing = [];
  if (resumeStatus !== "ready") missing.push("resume");
  if (!camReady) missing.push("camera");
  if (!micReady) missing.push("microphone");

  // =============== SETUP SCREEN ===============
  if (!started) {
    return (
      <div className="app">
        <div className="shell">
          <header className="brand">
            <span className="logo">🎤</span>
            <div>
              <h1>{SITE_NAME}</h1>
              <p>Upload your resume, turn on your camera and mic, and practice like a real interview.</p>
            </div>
          </header>

          <div className="grid">
            <section className="card">
              <h3><span className="num">1</span> Choose a role</h3>
              <div className="chips">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={"chip" + (r === role ? " active" : "")}
                    onClick={() => setRole(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>

            <section className="card">
              <h3><span className="num">2</span> Upload your resume <small>(required)</small></h3>
              <label
                className={
                  "drop" + (dragOver ? " over" : "") + (resumeStatus === "ready" ? " ok" : "")
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files[0]);
                }}
              >
                <input
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  hidden
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                {resumeStatus === "idle" && (
                  <>
                    <span className="big-ico">📄</span>
                    <b>Drop your resume here or click to upload</b>
                    <small>PDF or TXT, max 5 MB. Questions will be based on your resume.</small>
                  </>
                )}
                {resumeStatus === "reading" && (
                  <>
                    <span className="big-ico spin">⏳</span>
                    <b>Reading your resume...</b>
                    <small>{resumeName}</small>
                  </>
                )}
                {resumeStatus === "ready" && (
                  <>
                    <span className="big-ico">✅</span>
                    <b>Resume ready</b>
                    <small>{resumeName}</small>
                  </>
                )}
                {resumeStatus === "error" && (
                  <>
                    <span className="big-ico">⚠️</span>
                    <b>Could not read the resume</b>
                    <small>Click to try again</small>
                  </>
                )}
              </label>
              {resumeStatus === "ready" && (
                <button type="button" className="link" onClick={clearResume}>
                  Remove resume
                </button>
              )}
            </section>

            <section className="card">
              <h3><span className="num">3</span> Camera and microphone <small>(required)</small></h3>
              <Toggle
                on={camReady}
                onClick={allowCamera}
                icon="📷"
                title={camReady ? "Camera allowed" : "Allow camera"}
                desc="Required. Shows your video preview (never saved or sent anywhere)"
              />
              <Toggle
                on={micReady}
                onClick={allowMic}
                icon="🎙️"
                title={micReady ? "Microphone allowed" : "Allow microphone"}
                desc="Required. Lets you answer by voice and hear the interviewer"
              />
            </section>
          </div>

          {notice && <div className="notice">{notice}</div>}

          <button
            type="button"
            className="primary big"
            onClick={startInterview}
            disabled={missing.length > 0}
          >
            {missing.length === 0 ? "Start Interview →" : "Required: " + missing.join(", ")}
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  // =============== INTERVIEW SCREEN ===============
  return (
    <div className="app">
      <div className="shell wide">
        <div className="topbar">
          <div className="title">
            <span className="logo sm">🎤</span>
            <div>
              <b>{role}</b>
              <small>
                {finished ? "Interview complete" : qNum ? "Question " + qNum + " / " + TOTAL : "Starting..."}
              </small>
            </div>
          </div>
          <div className="bar">
            <i style={{ width: progress + "%" }} />
          </div>
          <button type="button" className="ghost" onClick={restart}>
            ↺ Restart
          </button>
        </div>

        <div className="interview">
          <aside className="side">
            <div className="video">
              {camOn ? (
                <video ref={videoRef} autoPlay playsInline muted />
              ) : (
                <div className="novideo">
                  <span>📷</span>
                  <small>Camera off</small>
                </div>
              )}
              {listening && <span className="live">● Listening</span>}
            </div>

            <div className="controls">
              <button
                type="button"
                className={"ctl" + (camOn ? " on" : "")}
                onClick={camOn ? undefined : startCamera}
              >
                📷 {camOn ? "Camera on" : "Enable camera"}
              </button>
              <button
                type="button"
                className={"ctl" + (speakOn ? " on" : "")}
                onClick={() => {
                  if (speakOn) window.speechSynthesis?.cancel();
                  setSpeakOn(!speakOn);
                }}
              >
                🔊 {speakOn ? "Voice on" : "Voice off"}
              </button>
            </div>

            <div className="badge">📄 Resume-based questions: {resumeName}</div>
            <div className="tips">
              <b>Tips</b>
              <small>Look straight at the camera and answer in STAR format (Situation, Task, Action, Result).</small>
            </div>
          </aside>

          <main className="chatcard">
            <div className="chat">
              {messages.slice(1).map((m, i) => (
                <div key={i} className={"row " + m.role}>
                  <div className="avatar">{m.role === "user" ? "🙂" : "🤖"}</div>
                  <div className="bubble">{renderText(m.content)}</div>
                </div>
              ))}
              {loading && (
                <div className="row assistant">
                  <div className="avatar">🤖</div>
                  <div className="bubble typing">
                    <i /><i /><i />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {!camOn && (
              <div className="notice">Camera is required. Click "Enable camera" to continue.</div>
            )}
            {notice && <div className="notice">{notice}</div>}

            {finished ? (
              <div className="done">
                <button type="button" className="primary" onClick={restart}>
                  Start a new interview
                </button>
              </div>
            ) : (
              <div className="inputRow">
                <button
                  type="button"
                  className={"mic" + (listening ? " rec" : "")}
                  onClick={toggleListen}
                  title="Answer by voice"
                >
                  🎤
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={listening ? "Listening, go ahead and speak..." : "Type your answer or press the mic..."}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <select className="lang" value={lang} onChange={(e) => setLang(e.target.value)} title="Speaking language">
                  <option value="en-IN">EN</option>
                  <option value="hi-IN">HI</option>
                </select>
                <button type="button" className="primary" onClick={send} disabled={loading || !input.trim() || !camOn}>
                  Send ➤
                </button>
              </div>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
