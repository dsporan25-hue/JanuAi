import { registerPlugin } from "@capacitor/core";

export interface JanuAssistantPlugin {
  execute(cmd: Record<string, unknown>): Promise<{ result: string }>;
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  getHistory(): Promise<{ history: Array<{ command: string; result: string; time: number; app: string }>; currentApp: string; lastQuery: string }>;
  clearHistory(): Promise<void>;
}

export const JanuAssistant = registerPlugin<JanuAssistantPlugin>("JanuAssistant");

/** বাংলা/ইংরেজি কথা থেকে কাজ বের করে। না বুঝলে null (তখন Gemini-তে যাবে)। */
export function parsePhoneCommand(text: string, currentApp = ""): Record<string, unknown> | null {
  const t = text.trim();
  const inYoutube = currentApp.includes("youtube");

  const open = t.match(/(ইউটিউব|youtube|হোয়াটসঅ্যাপ|whatsapp|ফেসবুক|facebook|ক্রোম|chrome|জিমেইল|gmail|ম্যাপ|maps|টেলিগ্রাম|telegram|ইনস্টাগ্রাম|instagram|মেসেঞ্জার|messenger).{0,12}(খোল|ওপেন|চালু|open)/i);
  if (open) return { action: "open_app", app: open[1] };

  const wa = t.match(/(.+?)\s*(কে|ke)\s*(মেসেজ|message|মেসেজ)\s*(দাও|পাঠাও|দেও|send)(.*)/i);
  if (wa) {
    const rest = wa[5].replace(/^[\s,:-]+/, "").replace(/(বলে|লিখে)\s*(দাও|পাঠাও)?$/, "").trim();
    return { action: "whatsapp_message", contact: wa[1].trim(), message: rest };
  }

  const search = t.match(/(.+?)\s*(খোঁজো|খুঁজো|খোজো|খুঁজে দাও|সার্চ করো|সার্চ দাও|search)/i);
  if (search && (inYoutube || /ইউটিউব|youtube|গান|song|ভিডিও|video/i.test(t))) {
    const q = search[1].replace(/ইউটিউবে|youtube/gi, "").trim();
    if (q) return { action: "youtube_search", query: q };
  }

  if (/^(পিছনে যাও|back)/i.test(t)) return { action: "back" };
  if (/^(হোমে যাও|home)/i.test(t)) return { action: "home" };
  if (/(নিচে স্ক্রল|scroll down)/i.test(t)) return { action: "scroll" };
  const click = t.match(/(.+?)\s*(তে ক্লিক|এ ক্লিক|চাপো|click)/i);
  if (click) return { action: "click_text", text: click[1].trim() };
  return null;
}

/** App.tsx থেকে কল করুন: কাজ হলে বার্তা ফেরত দেয়, না হলে null */
export async function runPhoneCommand(text: string): Promise<string | null> {
  try {
    const mem = await JanuAssistant.getHistory();
    const cmd = parsePhoneCommand(text, mem.currentApp);
    if (!cmd) return null;
    const { result } = await JanuAssistant.execute(cmd);
    return result;
  } catch {
    return null;
  }
}
