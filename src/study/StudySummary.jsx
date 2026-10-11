import { score } from './studyQueue.js';

// End of a study session: the score, and what to do next.
export function StudySummary({ session, onRedoMissed, onRestart, onDone }) {
  const { got, missed, answered } = score(session.results);
  const percent = answered ? Math.round((got / answered) * 100) : 0;
  const message =
    answered === 0
      ? 'No tapes answered this time.'
      : percent === 100
        ? 'Perfect! Every single one.'
        : percent >= 80
          ? 'Great work!'
          : percent >= 50
            ? 'Good progress. The missed ones will come first next time.'
            : 'Keep going: the missed ones will come first next time.';

  return (
    <div className="dialog-backdrop">
      <div className="dialog study-summary">
        <h2>Session done</h2>
        <div className="summary-score">
          <span className="big">{answered ? `${percent}%` : '–'}</span>
          <span className="muted">
            {got} of {answered} right{session.queue.length > answered ? ` · ${session.queue.length - answered} not answered` : ''}
          </span>
        </div>
        <div className="summary-bars">
          <div className="good" style={{ flex: got || 0.0001 }} />
          <div className="bad" style={{ flex: missed || 0.0001 }} />
        </div>
        <p>{message}</p>
        <div className="dialog-buttons wrap">
          <button className="button" onClick={onDone}>
            Done
          </button>
          <button className="button" onClick={onRestart}>
            Study all again
          </button>
          {missed > 0 && (
            <button className="button primary" onClick={onRedoMissed}>
              Redo missed ({missed})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
