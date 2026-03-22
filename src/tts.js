let enabled = false;

export async function initTTS() {
  enabled = 'speechSynthesis' in window;
  return enabled;
}

export function speakFeedback(text) {
  if (!enabled || !text) {
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.85;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('Speech synthesis failed:', error);
  }
}
