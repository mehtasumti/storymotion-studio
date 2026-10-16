import { useEffect, useState } from 'react';
import { mediaObjectUrl } from '../../lib/video/mediaFiles.js';

/** Object URL for a stored media item, or null while loading / when missing. */
export function useMediaUrl(id) {
  const [state, setState] = useState({ id: null, url: null, missing: false });
  useEffect(() => {
    let alive = true;
    if (!id) {
      setState({ id: null, url: null, missing: false });
      return undefined;
    }
    mediaObjectUrl(id).then((url) => {
      if (alive) setState({ id, url, missing: !url });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return state.id === id ? state : { id, url: null, missing: false };
}
