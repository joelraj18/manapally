import { useEffect, useRef } from 'react';
import goodTimesMusic from '../assets/music/The Good Times.mp3';

export default function AmbientMusic({
  isPlaying,
  onPlaybackBlocked,
}) {
  const audioReference = useRef(null);

  useEffect(() => {
    const audio = audioReference.current;

    if (!audio) {
      return undefined;
    }

    audio.loop = true;
    audio.volume = 0.28;

    if (isPlaying) {
      audio.play().catch(() => {
        onPlaybackBlocked?.();
      });
    } else {
      audio.pause();
    }

    return undefined;
  }, [isPlaying, onPlaybackBlocked]);

  useEffect(() => {
    const audio = audioReference.current;

    return () => {
      audio?.pause();
    };
  }, []);

  return (
    <audio
      ref={audioReference}
      src={goodTimesMusic}
      preload="metadata"
    />
  );
}