import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL(".env", import.meta.url))
});

const app = express();
const port = Number(process.env.PORT || 5001);
const aiServiceUrl = (process.env.AI_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

class AIServiceError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

const getImageFiles = (req) => ({
  beforeImage: req.files?.beforeImage?.[0],
  afterImage: req.files?.afterImage?.[0]
});

const appendImage = (formData, fieldName, file) => {
  formData.append(
    fieldName,
    new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" }),
    file.originalname || `${fieldName}.image`
  );
};

async function callAIService(path, files, fields = {}) {
  const formData = new FormData();
  appendImage(formData, "beforeImage", files.beforeImage);
  appendImage(formData, "afterImage", files.afterImage);

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  }

  let response;
  try {
    response = await fetch(`${aiServiceUrl}${path}`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(5 * 60 * 1000)
    });
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "The local AI service timed out."
      : "The local AI service is unreachable. Start the FastAPI service on port 8000.";
    throw new AIServiceError(message, 503);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new AIServiceError("The local AI service returned an invalid response.");
  }

  if (!response.ok) {
    const message = body.detail || body.error || body.message || "The local AI service request failed.";
    throw new AIServiceError(message, response.status >= 500 ? 502 : response.status);
  }

  return body;
}

const handleRouteError = (res, error, fallbackMessage) => {
  const statusCode = error instanceof AIServiceError ? error.statusCode : 500;
  if (statusCode >= 500) {
    console.error(`${fallbackMessage}:`, error);
  }

  return res.status(statusCode).json({
    success: false,
    message: fallbackMessage,
    error: error.message
  });
};

const imageUpload = upload.fields([
  { name: "beforeImage", maxCount: 1 },
  { name: "afterImage", maxCount: 1 }
]);

app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "online" });
});

app.post("/api/check-image-quality", imageUpload, async (req, res) => {
  const files = getImageFiles(req);
  if (!files.beforeImage || !files.afterImage) {
    return res.status(400).json({
      success: false,
      message: "Both BEFORE and AFTER images are required."
    });
  }

  try {
    const data = await callAIService("/quality", files);
    return res.json({ success: true, data });
  } catch (error) {
    return handleRouteError(res, error, "Image quality analysis failed.");
  }
});

app.post("/api/analyze", imageUpload, async (req, res) => {
  const files = getImageFiles(req);
  if (!files.beforeImage || !files.afterImage) {
    return res.status(400).json({
      success: false,
      message: "Both BEFORE and AFTER images are required."
    });
  }

  const areaKm2 = req.body.areaKm2 ? Number(req.body.areaKm2) : null;
  if (areaKm2 !== null && (!Number.isFinite(areaKm2) || areaKm2 <= 0)) {
    return res.status(400).json({
      success: false,
      message: "areaKm2 must be a positive number."
    });
  }

  try {
    const falseDetection = await callAIService("/quality", files);
    const alignmentIssue = falseDetection.issues?.find(
      (issue) => issue.type === "image_mismatch" && issue.detected
    );
    if (alignmentIssue) {
      return res.status(422).json({
        success: false,
        analysisBlocked: true,
        message: alignmentIssue.explanation,
        error: alignmentIssue.explanation,
        falseDetection
      });
    }

    const result = await callAIService("/analyze", files, { areaKm2 });
    if (result.data?.processing?.downsampled) {
      falseDetection.issues = [
        ...(falseDetection.issues || []),
        {
          type: "fast_preview_resolution",
          detected: true,
          severity: "medium",
          explanation: (
            `For fast preview, the ${result.data.processing.inputWidth} × ${result.data.processing.inputHeight} ` +
            `images were downsampled to ${result.data.processing.inferenceWidth} × ${result.data.processing.inferenceHeight} ` +
            "for inference. The change mask is scaled back to the input size; small changes may be missed."
          )
        }
      ];
    }

    return res.json({
      success: true,
      analysisBlocked: false,
      falseDetection,
      data: result.data
    });
  } catch (error) {
    return handleRouteError(res, error, "Image analysis failed.");
  }
});

const CHAT_CLASSES = [
  { category: "VEGETATION", pattern: /vegetation|forest|greenery|tree|trees|plant|plants|ped|paudhe|jungle|vanaspati/ },
  { category: "WATER", pattern: /water|lake|river|pond|pani|jal|nadi|talab/ },
  { category: "BUILDINGS", pattern: /building|buildings|urban|construction|imarat|ghar|makan/ },
  { category: "ROADS", pattern: /road|roads|street|streets|highway|highways|sadak|rasta|raaste/ },
  { category: "BARE LAND", pattern: /bare land|soil|desert|sand|mitti|ret|zameen/ },
  { category: "OTHER", pattern: /\bother\b|cloud|shadow|badal|anya/ }
];

const getChatAnalysis = (context) => {
  const result = context?.data || context?.result || context || {};
  const classes = result.landCover?.classes || result.transitionMatrix || result.transition_matrix || [];
  const binaryChange = result.binaryChange || result.binary_change || {};
  const mask = result.changeMask || result.change_mask || {};
  const summary = result.summary || result.changeSummary || result.change_summary || {};
  const changedPercent = Number(
    binaryChange.changePercent ??
    binaryChange.change_percent ??
    mask.changedPixelPercent ??
    mask.changed_pixel_percent ??
    summary.netClassShiftPercent ??
    summary.net_class_shift_percent
  );

  return {
    classes: classes.filter((item) => item?.category),
    changedPercent: Number.isFinite(changedPercent) ? changedPercent : null
  };
};

const formatPercent = (value) => Number(value || 0).toFixed(2);

const getLocalChatReply = (message, analysisContext, conversation = []) => {
  const query = message.toLowerCase().trim();
  const isHindi = /\b(kya|hai|hain|kaise|kaisa|kaisi|batao|bata|samjhao|samjha|asaan|kitna|kitni|badla|badli|hua|huwa|hota|hoti|karo|kare|karu|mujhe|aap|mera|meri|ye|ya|iska|uska|aur|chahiye|dikhao|kaam|badlav)\b/.test(query);
  const analysis = getChatAnalysis(analysisContext);
  const previousUserMessage = [...conversation].reverse().find((item) => item?.role === "user")?.content || "";
  const followUp = /^(aur|and|why|how|explain|tell me more|more|what about|iska|uska|ye|toh|phir)\b/.test(query);
  const effectiveQuery = followUp && !CHAT_CLASSES.some(({ pattern }) => pattern.test(query))
    ? `${query} ${previousUserMessage.toLowerCase()}`
    : query;
  const requestedClass = CHAT_CLASSES.find(({ pattern }) => pattern.test(effectiveQuery));
  const classResult = analysis.classes.find(
    (item) => item.category.toUpperCase() === requestedClass?.category
  );

  if (/^(hi|hello|hey|namaste|namaskar|salaam)\b/.test(query)) {
    return isHindi
      ? "Namaste! Main GeoZenX assistant hoon. Website ke baare mein poochhein, ya image analysis ke baad dono images ke changes ka simple summary maangein."
      : "Hi! I'm the GeoZenX assistant. Ask me about this website, or analyze two images and ask for a simple summary of what changed.";
  }

  if (/\b(thanks|thank you|shukriya|dhanyavaad)\b/.test(query)) {
    return isHindi ? "Aapka swagat hai! GeoZenX ya image results ke baare mein aur kuch poochhna ho toh poochhein." : "You're welcome! Ask me anything else about GeoZenX or your image results.";
  }

  if (/\b(website|geozenx|what does (this |the )?(website|site|geozenx) (do|offer)|what is (geozenx|this website|this site)|purpose|features|how (do|does) (this |the )?(website|site|geozenx)|how (do|does|can) i (use|start)|kaam|kya hai|kya kart|kaise use|madad|help)\b/.test(query)) {
    return isHindi
      ? "GeoZenX do alag samay ki images compare karke zameen mein dikhne wale badlav samajhne mein madad karta hai. Dono images upload karein aur “Analyze Changes” dabayein. Results mein vegetation, water, buildings, roads, bare land aur other ka estimated T1/T2 area aur difference dikhta hai. Analysis ke baad main uska simple summary bhi de sakta hoon."
      : "GeoZenX compares two images from different times to help you understand visible land changes. Upload both images and choose “Analyze Changes.” Results show estimated T1/T2 coverage and the difference for vegetation, water, buildings, roads, bare land, and other. After analysis, ask me to explain the results in plain language.";
  }

  if (/\b(what changed|biggest|largest|most changed|changed the most|changed most|sabse zyada|sabse bada|summary|summari[sz]e|overall|explain|report|result|simple|easy|asaan|samjha|batao|bata|kitna badlav|kitna change)\b/.test(query)) {
    if (!analysis.classes.length) {
      return isHindi
        ? "Pehle dono images upload karke “Analyze Changes” dabayein. Uske baad main har category ka T1 aur T2 percentage aur sabse bade badlav ko asaan bhasha mein samjha dunga."
        : "Upload both images and select “Analyze Changes” first. Then I can explain each category's T1 and T2 percentages and the biggest changes in simple language.";
    }

    const classes = analysis.classes;
    const highestIncrease = [...classes].sort((a, b) => Number(b.changePercent) - Number(a.changePercent))[0];
    const highestDecrease = [...classes].sort((a, b) => Number(a.changePercent) - Number(b.changePercent))[0];
    const classLines = classes.map((item) => {
      const change = Number(item.changePercent || 0);
      if (isHindi) {
        const direction = change > 0 ? `${formatPercent(change)} percentage point badha` : change < 0 ? `${formatPercent(Math.abs(change))} percentage point ghata` : "koi khaas badlav nahi hua";
        return `• ${item.category}: pehli image mein ${formatPercent(item.t1Percent)}%, doosri mein ${formatPercent(item.t2Percent)}% — ${direction}.`;
      }
      const direction = change > 0 ? `increased by ${formatPercent(change)} percentage points` : change < 0 ? `decreased by ${formatPercent(Math.abs(change))} percentage points` : "stayed about the same";
      return `• ${item.category}: ${formatPercent(item.t1Percent)}% → ${formatPercent(item.t2Percent)}% (${direction}).`;
    });

    const topChange = isHindi
      ? `Sabse zyada badha: ${highestIncrease.category} (${formatPercent(highestIncrease.changePercent)} percentage points). Sabse zyada ghata: ${highestDecrease.category} (${formatPercent(Math.abs(Number(highestDecrease.changePercent)))} percentage points).`
      : `Biggest increase: ${highestIncrease.category} (+${formatPercent(highestIncrease.changePercent)} percentage points). Biggest decrease: ${highestDecrease.category} (−${formatPercent(Math.abs(Number(highestDecrease.changePercent)))} percentage points).`;
    const binaryLine = analysis.changedPercent === null
      ? ""
      : isHindi
        ? `\nBinary change mask ne kul image area ka ${formatPercent(analysis.changedPercent)}% changed mark kiya.`
        : `\nThe binary change mask marked ${formatPercent(analysis.changedPercent)}% of the image area as changed.`;
    const caveat = isHindi
      ? "\nNote: category percentages RGB rangon aur local texture par aadharit andaze hain, verified land-cover survey nahi. Buildings aur roads ka alag estimate heuristic hai."
      : "\nNote: category percentages are estimates from visible RGB colors and local texture, not a verified land-cover survey. The separate buildings and roads estimates are heuristic.";

    return `${isHindi ? "Aasaan summary:" : "Simple summary:"}\n${classLines.join("\n")}\n\n${topChange}${binaryLine}${caveat}`;
  }

  if (/\b(buildings?|roads?|streets?)\b/.test(query) && /\b(buildings?|roads?|streets?)\b/.test(query.replace(/\b(buildings?|roads?|streets?)\b/, ""))) {
    const builtClasses = ["BUILDINGS", "ROADS"].map((category) =>
      analysis.classes.find((item) => item.category.toUpperCase() === category)
    ).filter(Boolean);
    if (builtClasses.length) {
      return builtClasses.map((item) => {
        const change = Number(item.changePercent || 0);
        const direction = change > 0
          ? `increased by ${formatPercent(change)} percentage points`
          : change < 0
            ? `decreased by ${formatPercent(Math.abs(change))} percentage points`
            : "stayed about the same";
        return `${item.category}: ${formatPercent(item.t1Percent)}% → ${formatPercent(item.t2Percent)}% (${direction}).`;
      }).join(" ") + " These separate building and road figures are heuristic visual estimates.";
    }
  }

  if (requestedClass) {
    if (!classResult) {
      return isHindi
        ? "Is category ka result abhi nahi mila. Dono images upload karke dobara analysis chalayein."
        : "I don't have a result for that category yet. Upload both images and run the analysis first.";
    }

    const change = Number(classResult.changePercent || 0);
    if (isHindi) {
      const direction = change > 0 ? `${formatPercent(change)} percentage point badha` : change < 0 ? `${formatPercent(Math.abs(change))} percentage point ghata` : "lagbhag wahi raha";
      return `${requestedClass.category} pehli image mein ${formatPercent(classResult.t1Percent)}% tha aur doosri mein ${formatPercent(classResult.t2Percent)}% hai. Yaani iski coverage ${direction}. Yeh image ke rangon par aadharit ek andaza hai.`;
    }
    const direction = change > 0 ? `increased by ${formatPercent(change)} percentage points` : change < 0 ? `decreased by ${formatPercent(Math.abs(change))} percentage points` : "stayed about the same";
    return `${requestedClass.category} covered ${formatPercent(classResult.t1Percent)}% in the first image and ${formatPercent(classResult.t2Percent)}% in the second. Its estimated coverage ${direction}. This is a heuristic estimate based on visible image colors and local texture.`;
  }

  if (/\b(change mask|binary change|changed area|total change|overall change|kitna area|kitna badlav)\b/.test(query)) {
    if (analysis.changedPercent === null) {
      return isHindi ? "Pehle images analyze karein; phir main changed area ka percentage bata sakta hoon." : "Analyze both images first, and I can tell you what percentage of the image was marked as changed.";
    }
    return isHindi
      ? `Dono images ke beech binary change mask ne ${formatPercent(analysis.changedPercent)}% image area ko changed mark kiya. Yeh sabhi land-cover categories ka net percentage change nahi, balki model ka pixel-level change estimate hai.`
      : `The binary change mask marked ${formatPercent(analysis.changedPercent)}% of the image area as changed. This is a pixel-level change estimate, not the net percentage change across land-cover categories.`;
  }

  return isHindi
    ? "Main GeoZenX website, image analysis ke steps, aur analysis ke baad vegetation, water, buildings, roads aur bare land ke changes samjha sakta hoon. Aap apna sawaal thoda aur bata sakte hain?"
    : "I can help with how GeoZenX works and explain your analyzed image results—vegetation, water, buildings, roads, bare land, and overall change. What would you like to know?";
};

app.post("/api/chat", (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    return res.status(400).json({
      success: false,
      message: "Message is required."
    });
  }

  return res.json({
    success: true,
    reply: getLocalChatReply(
      message,
      req.body.analysisContext,
      Array.isArray(req.body.conversation) ? req.body.conversation.slice(-10) : []
    )
  });
});

app.listen(port, () => {
  console.log(`Geozenx backend running on port ${port}; local AI service: ${aiServiceUrl}`);
});
