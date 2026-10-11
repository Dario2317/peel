import { score } from './studyQueue.js';
import '../tools/tools.css';

// The bar at the bottom in study mode.
//   - nothing peeled: "tap the highlighted tape", Skip, Finish
//   - a tape peeled:  the question again, and Missed / Got it
export function StudyBar({ session, question, onAnswer, onSkip, onFinish }) {
  const { got, missed, answered } = score(session.results);
  const total = session.queue.length;
  const progress = (
    <span className="study-progress">
      {answered} / {total} · <span className="good">✓ {got}</span> · <span className="bad">✗ {missed}</span>
    </span>
  );

  if (session.revealedId) {
    return (
      <div className="toolbar-wrap">
        <div className="study-bar answer">
          <div className="study-question">{question ? `“${question}”` : 'Did you know it?'}</div>
          <div className="study-buttons">
            <button className="button large missed" onClick={() => onAnswer('missed')}>
              ✗ Missed
            </button>
            <button className="button large got" onClick={() => onAnswer('got')}>
              ✓ Got it
            </button>
          </div>
          {progress}
        </div>
      </div>
    );
  }

  return (
    <div className="toolbar-wrap">
      <div className="study-bar">
        <span className="study-hint">Tap the highlighted tape to peel it</span>
        {progress}
        <div className="study-buttons">
          <button className="button small" onClick={onSkip}>
            Skip
          </button>
          <button className="button small" onClick={onFinish}>
            Finish
          </button>
        </div>
      </div>
    </div>
  );
}
