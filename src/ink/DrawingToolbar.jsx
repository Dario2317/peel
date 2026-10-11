import { HIGHLIGHT_COLORS, HIGHLIGHT_SIZES, PEN_COLORS, PEN_SIZES } from './inkStyle.js';
import { EraserIcon, HighlighterIcon, KeyboardIcon, PenIcon } from '../ui/icons.jsx';
import './ink.css';

/**
 * Drawing tools: pen, highlighter, eraser (and optionally "type"), with the
 * colors and sizes of the current tool. One tap to switch.
 *   ink / onInk: from useInkTool()
 *   typing / onTyping: optional keyboard mode
 */
export function DrawingToolbar({ ink, onInk, typing = false, onTyping }) {
  const highlighter = ink.tool === 'highlighter';
  const colors = highlighter ? HIGHLIGHT_COLORS : PEN_COLORS;
  const sizes = highlighter ? HIGHLIGHT_SIZES : PEN_SIZES;
  const color = highlighter ? ink.highlightColor : ink.penColor;
  const size = highlighter ? ink.highlightSize : ink.penSize;
  const showOptions = !typing && ink.tool !== 'eraser';

  const pick = (tool) => {
    onInk({ tool });
    onTyping?.(false);
  };
  const toolButton = (tool, label, icon) => (
    <button
      className={`tool ${!typing && ink.tool === tool ? 'on' : ''}`}
      onClick={() => pick(tool)}
      aria-pressed={!typing && ink.tool === tool}
      title={label}
    >
      {icon}
      <span className="tool-label">{label}</span>
    </button>
  );

  return (
    <div className="draw-bar">
      <div className="draw-tools">
        {toolButton('pen', 'Pen', <PenIcon />)}
        {toolButton('highlighter', 'Marker', <HighlighterIcon />)}
        {toolButton('eraser', 'Eraser', <EraserIcon />)}
        {onTyping && (
          <button className={`tool ${typing ? 'on' : ''}`} onClick={() => onTyping(!typing)} title="Type" aria-pressed={typing}>
            <KeyboardIcon />
            <span className="tool-label">Type</span>
          </button>
        )}
      </div>
      {showOptions && (
        <div className="draw-options">
          {colors.map((c) => (
            <button
              key={c}
              className={`color-dot ${c === color ? 'on' : ''}`}
              style={{ '--c': c }}
              aria-label={`Color ${c}`}
              onClick={() => onInk(highlighter ? { highlightColor: c } : { penColor: c })}
            />
          ))}
          <span className="toolbar-sep" />
          {sizes.map((s, i) => (
            <button
              key={s}
              className={`size-dot ${s === size ? 'on' : ''}`}
              aria-label={['Thin', 'Medium', 'Thick'][i]}
              onClick={() => onInk(highlighter ? { highlightSize: s } : { penSize: s })}
            >
              <span style={{ width: 5 + i * 5, height: 5 + i * 5, background: color }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
