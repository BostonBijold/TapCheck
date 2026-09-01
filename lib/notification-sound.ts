// Chirp played on a device that just completed a task via the NFC
// scan-to-complete binding's "Scan NFC to Save" step — see
// docs/features/nfc.md and models/Company.ts's notificationSound field.
export type NotificationSound = "standard" | "male";

const SOUND_URLS: Record<NotificationSound, string> = {
  standard: "/sounds/chirp.mp3",
  male: "/sounds/malechirp.mp3",
};

// Fire-and-forget — a blocked/failed playback (autoplay policy, no audio
// hardware) should never interrupt the save it's celebrating.
export function playNotificationSound(sound: NotificationSound) {
  try {
    const audio = new Audio(SOUND_URLS[sound]);
    void audio.play().catch(() => {});
  } catch {
    // no-op
  }
}
