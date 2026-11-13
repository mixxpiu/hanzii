export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakChinese(text: string, rate: number = 0.88): boolean {
  if (!isSpeechSupported()) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(
      (v) => v.lang.toLowerCase().startsWith('zh') || v.lang.toLowerCase().includes('cmn')
    );
    if (zhVoice) {
      utterance.voice = zhVoice;
    }
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
