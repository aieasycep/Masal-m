import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import TrackPlayer from 'react-native-track-player';
import { night, spacing } from '@masalim/ui';
import { setupPlayer } from '../../src/lib/player';

/**
 * Hidden diagnostic route (deep link: masalim://debug/player-smoke).
 *
 * Exercises the full RNTP pipeline — setup → updateOptions → load a bundled
 * asset → play — with step-by-step logcat markers, so the android-crash-log
 * workflow can reproduce native player crashes in an emulator without auth or
 * story data. Not linked from any user-facing screen; copy stays unlocalized
 * on purpose (it is read from logcat, not by users).
 */

const MARK = '[player-smoke]';

export default function PlayerSmoke() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const record = (line: string) => {
      // eslint-disable-next-line no-console -- logcat marker for the CI emulator run
      console.warn(`${MARK} ${line}`);
      if (!cancelled) setLines((previous) => [...previous, line]);
    };

    void (async () => {
      let step = 'start';
      try {
        record('starting');
        step = 'setupPlayer';
        await setupPlayer();
        record('setupPlayer ok');
        step = 'reset';
        await TrackPlayer.reset();
        record('reset ok');
        step = 'add';
        await TrackPlayer.add({
          id: 'debug-smoke',
          // RNTP resolves bundled-asset resource ids at runtime; its AddTrack
          // type only admits string URLs, hence the cast.
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- bundled asset id
          url: require('../../assets/debug-tone.wav') as unknown as string,
          title: 'Player smoke test',
          artist: 'Masalim diagnostics',
        });
        record('add ok');
        step = 'play';
        await TrackPlayer.play();
        record('play ok');
        await new Promise((resolve) => setTimeout(resolve, 4000));
        step = 'readback';
        const { state } = await TrackPlayer.getPlaybackState();
        const { position } = await TrackPlayer.getProgress();
        record(`DONE state=${String(state)} position=${position.toFixed(2)}`);
      } catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        // eslint-disable-next-line no-console -- logcat marker for the CI emulator run
        console.error(`${MARK} FAILED at ${step}: ${message}`);
        if (!cancelled) setLines((previous) => [...previous, `FAILED at ${step}: ${message}`]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Player smoke test</Text>
      {lines.map((line, index) => (
        <Text key={`${index}-${line.slice(0, 16)}`} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: night.bg },
  content: { padding: spacing.pageX, paddingTop: 64, gap: spacing.xs },
  title: { color: night.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.sm },
  line: { color: night.muted, fontSize: 13 },
});
