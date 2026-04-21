let audio: HTMLAudioElement | null = null;

export function playNotification() {
  if (!audio) {
    audio = new Audio('/notification.mp3');
    audio.volume = 0.5;
  }
  audio.currentTime = 0;
  audio.play().catch(console.error);
}