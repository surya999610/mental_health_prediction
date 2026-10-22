// Change this if your FastAPI server runs somewhere else.
const API_BASE = "https://mental-health-prediction-2-sunh.onrender.com";
const REQUEST_TIMEOUT_MS = 30000;

const form = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");
const states = ["idle", "loading", "result", "error"].reduce((acc, name) => {
  acc[name] = document.getElementById(`state-${name}`);
  return acc;
}, {});

const INT_FIELDS = ["Age", "Daily_Unlocks"];
const FLOAT_FIELDS = ["Avg_Daily_Usage_Hours", "Study_Hours", "Physical_Activity_Hours", "Sleep_Hours_Per_Night"];

/* ---------- panel state ---------- */
function showState(name) {
  Object.entries(states).forEach(([key, el]) => { el.hidden = key !== name; });
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.classList.toggle("busy", busy);
  submitBtn.querySelector(".label").textContent = busy ? "Predicting…" : "Predict score";
}

/* ---------- validation ---------- */
function setFieldError(field, message) {
  const wrapper = field.closest(".field");
  wrapper.classList.toggle("invalid", Boolean(message));
  wrapper.querySelector(".err").textContent = message || "";
}

function messageFor(field) {
  const v = field.validity;
  if (v.valueMissing) return "This field is required.";
  if (v.badInput) return "Enter a valid number.";
  if (v.stepMismatch && field.step === "1") return "Enter a whole number.";
  if (v.rangeUnderflow) return `Must be at least ${field.min}.`;
  if (v.rangeOverflow) return `Must be at most ${field.max}.`;
  if (field.name === "Country" && !field.value.trim()) return "This field is required.";
  return "";
}

function validateForm() {
  let firstInvalid = null;
  [...form.elements].forEach((field) => {
    if (!field.name) return;
    const message = messageFor(field);
    setFieldError(field, message);
    if (message && !firstInvalid) firstInvalid = field;
  });
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

form.addEventListener("input", (e) => {
  if (e.target.name) setFieldError(e.target, messageFor(e.target));
});

/* ---------- payload ---------- */
function buildPayload() {
  const data = Object.fromEntries(new FormData(form).entries());
  INT_FIELDS.forEach((k) => { data[k] = parseInt(data[k], 10); });
  FLOAT_FIELDS.forEach((k) => { data[k] = parseFloat(data[k]); });
  data.Country = data.Country.trim();
  return data;
}

/* ---------- API status badge ---------- */
const apiStatus = document.getElementById("api-status");
const apiStatusText = document.getElementById("api-status-text");

function setApiStatus(state) {
  apiStatus.dataset.state = state;
  apiStatusText.textContent = state === "online"
    ? `API connected (${API_BASE})`
    : state === "offline"
      ? `API not reachable at ${API_BASE}`
      : "Checking the API…";
}

async function checkApi() {
  setApiStatus("checking");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${API_BASE}/`, { signal: controller.signal });
    setApiStatus(res.ok ? "online" : "offline");
  } catch {
    setApiStatus("offline");
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- API ---------- */
class ApiError extends Error {
  constructor(status, body) {
    super(`API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function requestPrediction(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, body);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- result ---------- */
function describeScore(score) {
  if (score >= 7.5) return { cls: "", title: "Strong wellbeing", text: "The model predicts a high mental health score for this profile." };
  if (score >= 6) return { cls: "moderate", title: "Moderate wellbeing", text: "The model predicts a mid-range score. Habits like sleep and screen time can shift it." };
  return { cls: "low", title: "Lower wellbeing", text: "The model predicts a low score for this profile. Consider talking with a counsellor or doctor." };
}

function animateNumber(el, to, duration = 1100) {
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    el.textContent = (to * (1 - Math.pow(1 - t, 3))).toFixed(2);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function showResult(score, inputs) {
  const info = describeScore(score);
  const fill = document.getElementById("dial-fill");
  fill.setAttribute("class", `fill ${info.cls}`);
  fill.style.strokeDashoffset = 100;
  document.getElementById("band-title").textContent = info.title;
  document.getElementById("band-text").textContent = info.text;
  states.result.dataset.band = info.cls || "good";
  const recap = document.getElementById("recap");
  recap.innerHTML = "";
  [["Daily use", `${inputs.Avg_Daily_Usage_Hours} h`], ["Sleep", `${inputs.Sleep_Hours_Per_Night} h`],
   ["Activity", `${inputs.Physical_Activity_Hours} h`], ["Stress", inputs.Stress_Level]].forEach(([k, v]) => {
    const chip = document.createElement("span");
    chip.innerHTML = `${k} <b></b>`;
    chip.querySelector("b").textContent = v;
    recap.appendChild(chip);
  });
  showState("result");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.strokeDashoffset = 100 - Math.max(0, Math.min(score / 10, 1)) * 100;
  }));
  animateNumber(document.getElementById("score-value"), score);
  if (window.matchMedia("(max-width: 900px)").matches) {
    states.result.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ---------- errors ---------- */
function fieldLabel(name) {
  const field = form.elements[name];
  const label = field && field.closest(".field")?.querySelector("label");
  return label ? label.textContent : name.replace(/_/g, " ");
}

function showError(title, text, details = []) {
  document.getElementById("error-title").textContent = title;
  document.getElementById("error-text").textContent = text;
  const list = document.getElementById("error-list");
  list.innerHTML = "";
  details.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.appendChild(li);
  });
  showState("error");
}

function handleError(err) {
  console.error("Prediction request failed:", err, err.body || "");
  if (err.name === "AbortError") {
    return showError("The request timed out", "The API did not answer within 30 seconds. Check that the server is running, then try again.");
  }
  if (err instanceof ApiError) {
    const detail = err.body && err.body.detail;
    if (err.status === 422 && Array.isArray(detail)) {
      const lines = detail.map((d) => {
        const name = d.loc[d.loc.length - 1];
        const field = form.elements[name];
        if (field) setFieldError(field, d.msg);
        return `${fieldLabel(name)}: ${d.msg}`;
      });
      return showError("Some values were rejected", "The API could not accept these inputs. Fix them and try again.", lines);
    }
    if (err.status >= 500) {
      return showError(`The server hit an error (${err.status})`, "The API is running but the model failed while predicting. Open the terminal where uvicorn is running to read the traceback. A scikit-learn version different from the one used to train the model is a common cause.");
    }
    return showError(`Request failed (${err.status})`, typeof detail === "string" ? detail : "The API returned an unexpected response.");
  }
  setApiStatus("offline");
  showError("Cannot reach the API", `No response from ${API_BASE}. Start the backend with "uvicorn main:app --reload" in the folder that contains main.py, then try again.`);
}

/* ---------- events ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) return;
  setBusy(true);
  showState("loading");
  try {
    const payload = buildPayload();
    const data = await requestPrediction(payload);
    setApiStatus("online");
    showResult(Number(data.predicted_mental_health_score), payload);
  } catch (err) {
    handleError(err);
  } finally {
    setBusy(false);
  }
});

form.addEventListener("reset", () => {
  [...form.elements].forEach((f) => f.name && setFieldError(f, ""));
  showState("idle");
});

apiStatus.addEventListener("click", checkApi);
checkApi();

document.getElementById("retry-btn").addEventListener("click", () => showState("idle"));
