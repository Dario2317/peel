import { useState } from 'react';
import { useHistoryState } from '../state/useAnnotations.js';
import { colorValue, POSTIT_COLORS, TAPE_COLORS, TAPE_PATTERNS, tapeBackground } from '../overlay/looks.js';
import { EyeIcon, HandIcon, NoteIcon, RedoIcon, TapeIcon, UndoIcon } from '../ui/icons.jsx';
import './tools.css';

// The edit toolbar at the bottom of the screen. One tap switches tool; tap
// the active tool again to choose its color/pattern.
export function Toolbar({
  tool, onTool, store, peek, onPeek,
  tapeStyle, onTapeStyle, postItColor, onPostItColor, onUndo, onRedo,
}) {
  const { canUndo, canRedo } = useHistoryState(store);
  const [options, setOptions] = useState(null); // 'tape' | 'postit' | null

  const choose = (id) => {
    if (id === tool && id !== 'select') setOptions(options === id ? null : id);
    else {
      onTool(id);
      setOptions(null);
    }
  };

  const toolButton = (id, label, icon, dot) => (
    <button
      className={`tool ${tool === id ? 'on' : ''}`}
      onClick={() => choose(id)}
      aria-pressed={tool === id}
      title={label}
    >
      {icon}
      {dot && <span className="tool-dot" style={dot} />}
      <span className="tool-label">{label}</span>
    </button>
  );

  return (
    <div className="toolbar-wrap">
      {options === 'tape' && (
        <div className="tool-options">
          <div className="swatches">
            {TAPE_COLORS.map((c) => (
              <button
                key={c.id}
                className={`swatch ${tapeStyle.color === c.id ? 'on' : ''}`}
                style={{ background: c.value }}
                aria-label={`Tape color ${c.id}`}
                onClick={() => onTapeStyle({ ...tapeStyle, color: c.id })}
              />
            ))}
          </div>
          <div className="patterns">
            {TAPE_PATTERNS.map((p) => (
              <button
                key={p}
                className={`pattern ${tapeStyle.pattern === p ? 'on' : ''}`}
                style={tapeBackground(tapeStyle.color, p)}
                aria-label={`Tape pattern ${p}`}
                title={p}
                onClick={() => onTapeStyle({ ...tapeStyle, pattern: p })}
              />
            ))}
          </div>
        </div>
      )}
      {options === 'postit' && (
        <div className="tool-options">
          <div className="swatches">
            {POSTIT_COLORS.map((c) => (
              <button
                key={c.id}
                className={`swatch ${postItColor === c.id ? 'on' : ''}`}
                style={{ background: c.value }}
                aria-label={`Post-it color ${c.id}`}
                onClick={() => onPostItColor(c.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="toolbar" role="toolbar" aria-label="Tools">
        {toolButton('select', 'Move', <HandIcon />)}
        {toolButton('postit', 'Post-it', <NoteIcon />, { background: colorValue(POSTIT_COLORS, postItColor) })}
        {toolButton('tape', 'Tape', <TapeIcon />, tapeBackground(tapeStyle.color, tapeStyle.pattern))}
        <span className="toolbar-sep" />
        <button className="tool" onClick={onUndo} disabled={!canUndo} title="Undo">
          <UndoIcon />
          <span className="tool-label">Undo</span>
        </button>
        <button className="tool" onClick={onRedo} disabled={!canRedo} title="Redo">
          <RedoIcon />
          <span className="tool-label">Redo</span>
        </button>
        <span className="toolbar-sep" />
        <button className={`tool ${peek ? 'on' : ''}`} onClick={onPeek} aria-pressed={peek} title="See through tapes">
          <EyeIcon />
          <span className="tool-label">Peek</span>
        </button>
      </div>
    </div>
  );
}
