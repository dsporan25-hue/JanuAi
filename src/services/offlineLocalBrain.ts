import type { BatteryInfo, ContactItem, LanguageCode, MemoryItem } from "../types/piya";

export interface LocalOfflineResult {
  reply: string;
  language: LanguageCode;
  toolActions: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  isOfflineFallbackNotice?: boolean;
}

/**
 * Detects language locally (Bengali, Hindi, or English) without requiring internet.
 */
export function detectLocalLanguage(input: string, fallback: LanguageCode): LanguageCode {
  const bnChars = (input.match(/[\u0980-\u09FF]/g) || []).length;
  const hiChars = (input.match(/[\u0900-\u097F]/g) || []).length;

  if (bnChars > 0 && bnChars >= hiChars) return "bn";
  if (hiChars > 0 && hiChars > bnChars) return "hi";

  const lower = input.toLowerCase();
  const bnWords = ["kemon", "acho", "koro", "kholo", "baja", "jalao", "bondho", "koto", "somoy", "amar"];
  const hiWords = ["kaise", "kya", "karo", "kholo", "bajao", "jalao", "band", "kitna", "samay", "mera"];
  const enWords = [
    "what",
    "time",
    "battery",
    "turn on",
    "turn off",
    "open",
    "call",
    "flashlight",
    "torch",
    "alarm",
    "lock",
    "hello",
    "who are you",
  ];

  let bnScore = 0;
  let hiScore = 0;
  let enScore = 0;

  for (const w of bnWords) if (lower.includes(w)) bnScore++;
  for (const w of hiWords) if (lower.includes(w)) hiScore++;
  for (const w of enWords) if (lower.includes(w)) enScore++;

  if (enScore > bnScore && enScore > hiScore && /^[a-z0-9\s.,?!:'"-]+$/i.test(input.trim())) {
    return "en";
  }
  if (bnScore > hiScore) return "bn";
  if (hiScore > bnScore) return "hi";
  return fallback;
}

function normalizeAsciiDigits(raw: string): string {
  return raw
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/**
 * Executes supported local commands offline (Flashlight, Battery, Time/Date, Alarm, Call, App Launch,
 * Settings, Screen Lock, Notes, Saved Memories) and honestly reports when internet is needed for cloud Q&A.
 */
export function evaluateLocalOfflineCommand(params: {
  utterance: string;
  preferredLanguage: LanguageCode;
  battery: BatteryInfo;
  flashlightOn: boolean;
  contacts: ContactItem[];
  memories: MemoryItem[];
}): LocalOfflineResult {
  const { utterance, preferredLanguage, battery, flashlightOn, contacts, memories } = params;
  const text = utterance.trim();
  const lang = detectLocalLanguage(text, preferredLanguage);
  const norm = normalizeAsciiDigits(text).toLowerCase();
  const actionId = `offline_${Date.now()}`;

  // 1. Flashlight / Torch ON / OFF
  if (
    /flashlight|torch|ফ্ল্যাশলাইট|টর্চ|লাইট|फ़्लैशलाइट|टॉर्च|लाइट/i.test(norm)
  ) {
    const turnOff =
      /\b(off|stop|close|disable|band|bondho)\b|বন্ধ|অফ|बंद|ऑफ़/i.test(norm);
    const turnOn =
      /\b(on|start|enable|jalao)\b|জ্বালাও|চালু|অন|जलाओ|चालू|ऑन/i.test(norm);
    const mode = turnOff ? "off" : turnOn ? "on" : flashlightOn ? "off" : "on";

    const reply =
      lang === "bn"
        ? mode === "on"
          ? "অফলাইন মোডে ফ্ল্যাশলাইট চালু করা হচ্ছে।"
          : "অফলাইন মোডে ফ্ল্যাশলাইট বন্ধ করা হচ্ছে।"
        : lang === "hi"
        ? mode === "on"
          ? "ऑफ़लाइन मोड में फ़्लैशलाइट चालू की जा रही है।"
          : "ऑफ़लाइन मोड में फ़्लैशलाइट बंद की जा रही है।"
        : mode === "on"
        ? "Turning on the flashlight in offline mode."
        : "Turning off the flashlight in offline mode.";

    return {
      reply,
      language: lang,
      toolActions: [{ id: actionId, name: "controlFlashlight", args: { mode } }],
    };
  }

  // 2. Battery Percentage Check
  if (/battery|charge|ব্যাটারি|চার্জ|बैटरी|चार्ज/i.test(norm)) {
    const pct = battery.supported && battery.level !== null ? battery.level : null;
    const charging = Boolean(battery.charging);
    const reply =
      pct !== null
        ? lang === "bn"
          ? `আপনার ফোনের ব্যাটারি এখন ${pct} শতাংশ${charging ? " এবং চার্জ হচ্ছে" : ""}।`
          : lang === "hi"
          ? `आपके फ़ोन की बैटरी अभी ${pct} प्रतिशत है${charging ? " और चार्ज हो रही है" : ""}।`
          : `Your phone battery is currently at ${pct} percent${charging ? " and charging" : ""}.`
        : lang === "bn"
        ? "অফলাইন ব্রাউজারে ব্যাটারির তথ্য পাওয়া যায়নি, তবে Android APK-তে এটি সরাসরি কাজ করে।"
        : lang === "hi"
        ? "इस ब्राउज़र में बैटरी की जानकारी उपलब्ध नहीं है, पर Android APK में यह काम करता है।"
        : "Battery level is unavailable in this browser, though it works directly in the Android APK.";

    return {
      reply,
      language: lang,
      toolActions: [{ id: actionId, name: "checkBatteryStatus", args: {} }],
    };
  }

  // 3. Current Time & Date
  if (
    /\b(time|date|day|today)\b|কয়টা বাজে|সময় কত|সময় কত|তারিখ|বার|कितने बजे|समय क्या|तारीख|आज कौन सा दिन/i.test(
      norm
    )
  ) {
    const now = new Date();
    const locale = lang === "bn" ? "bn-BD" : lang === "hi" ? "hi-IN" : "en-US";
    const timeStr = now.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
    const dateStr = now.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const reply =
      lang === "bn"
        ? `এখন সময় ${timeStr}, আর আজ ${dateStr}।`
        : lang === "hi"
        ? `अभी समय ${timeStr} है, और आज ${dateStr} है।`
        : `It is currently ${timeStr}, ${dateStr}.`;

    return { reply, language: lang, toolActions: [] };
  }

  // 4. Lock Phone Screen
  if (
    /\b(lock phone|lock screen|screen lock|lock my phone)\b|ফোন লক|স্ক্রিন লক|फ़ोन लॉक|स्क्रीन लॉक/i.test(
      norm
    )
  ) {
    const reply =
      lang === "bn"
        ? "ফোন স্ক্রিন লক করার প্রস্তুতি নেওয়া হয়েছে। নিশ্চিত করতে হ্যাঁ বলুন।"
        : lang === "hi"
        ? "फ़ोन स्क्रीन लॉक करने के लिए तैयार है। पुष्टि के लिए हाँ बोलें।"
        : "Ready to lock the phone screen. Say yes to confirm.";

    return {
      reply,
      language: lang,
      toolActions: [{ id: actionId, name: "lockPhoneScreen", args: {} }],
    };
  }

  // 5. Open System Settings (Wi-Fi / Bluetooth / Settings)
  if (/\b(wifi|wi-fi|bluetooth|settings)\b|ওয়াইফাই|ব্লুটুথ|সেটিংস|वाईफाई|ब्लूटूथ|सेटिंग्स/i.test(norm)) {
    const settingType = /wifi|wi-fi|ওয়াইফাই|वाईफाई/i.test(norm)
      ? "wifi"
      : /bluetooth|ব্লুটুথ|ब्लूटूथ/i.test(norm)
      ? "bluetooth"
      : "phone_settings";

    const reply =
      lang === "bn"
        ? `${settingType === "wifi" ? "ওয়াই-ফাই" : settingType === "bluetooth" ? "ব্লুটুথ" : "ফোন"} সেটিংস খুলতে প্রস্তুত। হ্যাঁ বলুন।`
        : lang === "hi"
        ? `${settingType === "wifi" ? "वाई-फ़ाई" : settingType === "bluetooth" ? "ब्लूटूथ" : "फ़ोन"} सेटिंग्स खोलने के लिए हाँ बोलें।`
        : `Ready to open ${settingType.replace("_", " ")}. Say yes to confirm.`;

    return {
      reply,
      language: lang,
      toolActions: [{ id: actionId, name: "openSystemSettings", args: { settingType } }],
    };
  }

  // 6. Set Alarm Offline
  if (/alarm|অ্যালার্ম|এলার্ম|अलार्म/i.test(norm)) {
    const timeMatch = norm.match(/(\d{1,2})(?:[:.\s]+(\d{1,2}))?/);
    let hour = timeMatch ? Number(timeMatch[1]) : 7;
    const minute = timeMatch && timeMatch[2] ? Math.min(59, Number(timeMatch[2])) : 0;
    const isPm = /\bpm\b|বিকেল|রাত|সন্ধ্যা|शाम|रात/i.test(norm);
    const isAm = /\bam\b|সকাল|ভোর|सुबह/i.test(norm);
    if (isPm && hour < 12) hour += 12;
    if (isAm && hour === 12) hour = 0;
    hour = Math.max(0, Math.min(23, hour));

    const tStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const reply =
      lang === "bn"
        ? `অফলাইন মোডে ${tStr} সময়ের অ্যালার্ম প্রস্তুত। সেট করতে হ্যাঁ বলুন।`
        : lang === "hi"
        ? `ऑफ़लाइन मोड में ${tStr} बजे का अलार्म तैयार है। सेट करने के लिए हाँ बोलें।`
        : `Offline alarm prepared for ${tStr}. Say yes to confirm.`;

    return {
      reply,
      language: lang,
      toolActions: [
        {
          id: actionId,
          name: "setDeviceAlarm",
          args: { hour, minute, label: "Janu AI Offline Alarm" },
        },
      ],
    };
  }

  // 7. Phone Call to Saved Contact Offline
  if (/\b(call|phone|dial)\b|কল করো|ফোন লাগাও|ফোন করো|कॉल करो|फ़ोन लगाओ|फोन करो/i.test(norm)) {
    let matchedName = "";
    for (const c of contacts) {
      const parts = c.name.toLowerCase().split(/\s+/);
      if (norm.includes(c.name.toLowerCase()) || parts.some((p) => p.length > 2 && norm.includes(p))) {
        matchedName = c.name;
        break;
      }
    }
    if (!matchedName) {
      const cleanedTarget = text
        .replace(/call|phone|dial|কল করো|কে কল করো|ফোন লাগাও|ফোন করো|कॉल करो|को कॉल करो|फ़ोन लगाओ/gi, "")
        .trim();
      matchedName = cleanedTarget;
    }

    const reply =
      lang === "bn"
        ? `কন্টাক্ট খুঁজে কল প্রস্তুত করা হচ্ছে।`
        : lang === "hi"
        ? `कॉन्टैक्ट ढूँढकर कॉल तैयार किया जा रहा है।`
        : `Looking up contact to prepare your call.`;

    return {
      reply,
      language: lang,
      toolActions: [
        {
          id: actionId,
          name: "proposePhoneCall",
          args: { contactName: matchedName },
        },
      ],
    };
  }

  // 8. Open Local Installed Apps Offline
  const appCandidates = [
    { match: /youtube music|ইউটিউব মিউজিক|यूट्यूब म्यूजिक/i, appName: "YouTube Music" },
    { match: /youtube|ইউটিউব|यूट्यूब/i, appName: "YouTube" },
    { match: /whatsapp|হোয়াটসঅ্যাপ|व्हाट्सऐप/i, appName: "WhatsApp" },
    { match: /spotify|স্পটিফাই|स्पॉटिफ़ाई/i, appName: "Spotify" },
    { match: /chrome|ক্রোম|क्रोम/i, appName: "Chrome" },
    { match: /maps|ম্যাপস|मैप्स/i, appName: "Google Maps" },
    { match: /camera|ক্যামেরা|कैमरा/i, appName: "Camera" },
    { match: /gmail|জিমেইল|जीमेल/i, appName: "Gmail" },
    { match: /instagram|ইনস্টাগ্রাম|इंस्टाग्राम/i, appName: "Instagram" },
  ];
  if (/\b(open|launch|start)\b|খোলো|চালু করো|खोलो|चालू करो/i.test(norm)) {
    for (const item of appCandidates) {
      if (item.match.test(norm)) {
        const reply =
          lang === "bn"
            ? `${item.appName} খুলতে হ্যাঁ বলুন।`
            : lang === "hi"
            ? `${item.appName} खोलने के लिए हाँ बोलें।`
            : `Say yes to open ${item.appName}.`;
        return {
          reply,
          language: lang,
          toolActions: [{ id: actionId, name: "openApplication", args: { appName: item.appName } }],
        };
      }
    }
  }

  // 9. Save Personal Note Offline
  if (/\b(save note|write note|take a note)\b|নোট লেখো|নোট সেভ|नोट लिखो|नोट सेव/i.test(norm)) {
    const content = text
      .replace(/save note|write note|take a note|নোট লেখো|নোট সেভ করো|नोट लिखो|नोट सेव करो/gi, "")
      .trim() || text;
    const reply =
      lang === "bn"
        ? "আপনার নোটটি অফলাইনে সংরক্ষণ করা হয়েছে।"
        : lang === "hi"
        ? "आपका नोट ऑफ़लाइन सहेज लिया गया है।"
        : "Your note has been saved locally offline.";
    return {
      reply,
      language: lang,
      toolActions: [
        { id: actionId, name: "createPersonalNote", args: { title: "Offline Note", content } },
      ],
    };
  }

  // 10. Save Memory Offline
  if (/\b(remember that|remember)\b|মনে রাখো|মনে রেখো|याद रखो|याद रखना/i.test(norm)) {
    const fact = text
      .replace(/remember that|remember|মনে রাখো|মনে রেখো|याद रखो|याद रखना/gi, "")
      .trim() || text;
    const reply =
      lang === "bn"
        ? "আমি এটি লোকাল মেমোরিতে সংরক্ষণের জন্য প্রস্তুত করেছি।"
        : lang === "hi"
        ? "मैंने इसे लोकल मेमोरी में सहेजने के लिए तैयार किया है।"
        : "Prepared to save this in your local memory.";
    return {
      reply,
      language: lang,
      toolActions: [
        { id: actionId, name: "proposeMemorySave", args: { category: "Offline", fact } },
      ],
    };
  }

  // 11. Recall Saved Memories Offline
  if (memories.length > 0 && /\b(what do you remember|my favorite)\b|প্রিয়|পছন্দ|मेरा पसंदीदा|क्या याद है/i.test(norm)) {
    const summary = memories.slice(0, 3).map((m) => m.fact).join("; ");
    const reply =
      lang === "bn"
        ? `আপনার সংরক্ষিত মেমোরি অনুযায়ী: ${summary}।`
        : lang === "hi"
        ? `आपकी सहेजी गई मेमोरी के अनुसार: ${summary}।`
        : `From your saved memory on this device: ${summary}.`;
    return { reply, language: lang, toolActions: [] };
  }

  // 12. Identity & Greetings Offline
  if (
    /\b(hello|hi|hey|who are you|your name|how are you)\b|কেমন আছো|তোমার নাম|নমস্কার|হ্যালো|तुम्हारा नाम|कैसी हो|नमस्ते/i.test(
      norm
    )
  ) {
    const reply =
      lang === "bn"
        ? "নমস্কার! আমি জানু এআই। এখন ইন্টারনেট বন্ধ থাকলেও আমি অফলাইন লোকাল কমান্ড—যেমন কল, টর্চলাইট, ব্যাটারি, সময়, অ্যালার্ম ও অ্যাপ খোলার কাজ করতে প্রস্তুত।"
        : lang === "hi"
        ? "नमस्ते! मैं जानू एआई हूँ। अभी इंटरनेट बंद है, फिर भी मैं कॉल, फ़्लैशलाइट, बैटरी, समय, अलार्म और ऐप खोलने जैसे लोकल कमांड पूरे कर सकती हूँ।"
        : "Hello! I am Janu AI. Internet is currently offline, so I am running in Offline Local Mode ready for calls, flashlight, battery, time, alarms, and opening apps.";
    return { reply, language: lang, toolActions: [] };
  }

  // 13. Clear Honest Notice when Cloud AI Reasoning is Unavailable Offline
  const fallbackReply =
    lang === "bn"
      ? "বর্তমানে ইন্টারনেট সংযোগ নেই, তাই অনলাইন এআই উপলব্ধ নয়। অফলাইন অবস্থায় আপনি কল, ফ্ল্যাশলাইট, ব্যাটারি, সময়, অ্যালার্ম, নোট এবং অ্যাপ খোলার নির্দেশ দিতে পারেন। ইন্টারনেট চালু হলেই আমি স্বয়ংক্রিয়ভাবে অনলাইন মোডে ফিরে যাব।"
      : lang === "hi"
      ? "अभी इंटरनेट कनेक्शन नहीं है, इसलिए ऑनलाइन एआई उपलब्ध नहीं है। ऑफ़लाइन मोड में आप कॉल, फ़्लैशलाइट, बैटरी, समय, अलार्म, नोट और ऐप खोलने के निर्देश दे सकते हैं। इंटरनेट आते ही मैं अपने-आप ऑनलाइन मोड में लौट आऊँगी।"
      : "Internet is currently unavailable, so online cloud AI cannot answer general questions right now. In offline mode you can still control calls, flashlight, battery, time, alarms, notes, and apps—and I will switch back to Online Mode automatically once internet returns.";

  return {
    reply: fallbackReply,
    language: lang,
    toolActions: [],
    isOfflineFallbackNotice: true,
  };
}
