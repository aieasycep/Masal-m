import TrackPlayer, { Event, State } from 'react-native-track-player';

/**
 * RNTP background service — handles lock-screen / notification remote events
 * while the JS UI may be unmounted. Registered once in index.js via
 * `TrackPlayer.registerPlaybackService(() => playbackService)`.
 *
 * Keep this module dependency-light: it must not pull in i18n, stores or the
 * API client, because it also runs as an Android headless task.
 */
export async function playbackService(): Promise<void> {
  /** Whether WE paused playback because of a temporary audio-focus duck. */
  let pausedByDuck = false;

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    pausedByDuck = false;
    void TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    pausedByDuck = false;
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward, (event) => {
    void TrackPlayer.seekBy(Math.abs(event.interval));
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, (event) => {
    void TrackPlayer.seekBy(-Math.abs(event.interval));
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    void TrackPlayer.seekTo(Math.max(0, event.position));
  });

  // Audio focus interruptions (phone calls, other apps taking over audio).
  // Permanent loss → pause and stay paused; temporary duck → pause and resume
  // when the interruption ends, but only if WE were the ones who paused.
  TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
    void (async () => {
      if (event.permanent) {
        pausedByDuck = false;
        await TrackPlayer.pause();
        return;
      }
      if (event.paused) {
        const { state } = await TrackPlayer.getPlaybackState();
        if (state === State.Playing) {
          pausedByDuck = true;
          await TrackPlayer.pause();
        }
        return;
      }
      if (pausedByDuck) {
        pausedByDuck = false;
        await TrackPlayer.play();
      }
    })().catch(() => {
      // Interruption handling is best-effort — never crash the service.
    });
  });
}
