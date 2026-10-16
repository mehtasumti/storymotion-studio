import { Check, Clock, TriangleAlert } from 'lucide-react';
import { formatTime } from '../lib/format.js';
import { sumDurations } from '../lib/storyEngine.js';

export default function Timeline({ scenes, target, onSelect }) {
  const total = sumDurations(scenes);
  const diff = total - target;

  return (
    <div className="timeline">
      <div className="timeline-head">
        <h3 className="timeline-title">
          <Clock size={16} aria-hidden="true" />
          Timeline
        </h3>
        <p className={`total-indicator ${diff === 0 ? 'is-ok' : 'is-off'}`} aria-live="polite">
          {diff === 0 ? <Check size={15} aria-hidden="true" /> : <TriangleAlert size={15} aria-hidden="true" />}
          <span>
            Total {formatTime(total)} ({total}s) · target {target}s
            {diff !== 0 ? ` · ${Math.abs(diff)}s ${diff > 0 ? 'over' : 'under'}` : ''}
          </span>
        </p>
      </div>

      <ol className="timeline-track" aria-label="Scene timeline. Select a scene to jump to it.">
        {scenes.map((scene) => (
          <li key={scene.id} style={{ flexGrow: scene.duration }} className={scene.isDerived ? 'is-derived' : ''}>
            <button
              type="button"
              onClick={() => onSelect(scene.id)}
              title={`${scene.title} · ${formatTime(scene.startTime)}–${formatTime(scene.endTime)}`}
              aria-label={`Scene ${scene.sceneNumber}, ${formatTime(scene.startTime)} to ${formatTime(scene.endTime)}, ${scene.duration} seconds${scene.isDerived ? ', derived beat' : ''}. Jump to scene.`}
            >
              <span className="seg-num">{scene.sceneNumber}</span>
              <span className="seg-time">{scene.duration}s</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="timeline-scale" aria-hidden="true">
        <span>00:00</span>
        <span>{formatTime(total / 2)}</span>
        <span>{formatTime(total)}</span>
      </div>
    </div>
  );
}
