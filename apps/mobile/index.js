// App entry: register the track-player background service BEFORE the router
// mounts, then hand off to Expo Router. Lock-screen / notification controls
// call into playbackService while the JS UI may be unmounted.
import TrackPlayer from 'react-native-track-player';
import { playbackService } from './src/lib/playback-service';
import 'expo-router/entry';

TrackPlayer.registerPlaybackService(() => playbackService);
