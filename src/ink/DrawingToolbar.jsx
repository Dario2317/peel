import { HIGHLIGHT_COLORS, HIGHLIGHT_SIZES, PEN_COLORS, PEN_SIZES } from './inkStyle.js';
import { EraserIcon, HighlighterIcon, KeyboardIcon, LassoIcon, PenIcon } from '../ui/icons.jsx';
import './ink.css';

/**
 * Drawing tools for the post-it boards: pen, marker, eraser, lasso (and
 * optionally "type"), with the colors and sizes of the current tool.
 *   ink / onInk: from useInkTool()
 *   typing / onTyping: optional keyboard mode
 *   textOptions: shown instead of the pen options while typing
 */
export function DrawingToolbar({ ink, onInk, typing = false, onTyping, textOptions = null }) {
  const showOptions = !typing && (ink.tool === 'pen' || ink.tool === 'highlighter');

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
        {toolButton('lasso', 'Lasso', <LassoIcon />)}
        {onTyping && (
          <button className={`tool ${typing ? 'on' : ''}`} onClick={() => onTyping(!typing)} title="Type" aria-pressed={typing}>
            <KeyboardIcon />
            <span className="tool-label">Type</span>
          </button>
        )}
      </div>
      {showOptions && <DrawingOptions ink={ink} onInk={onInk} tool={ink.tool} />}
      {typing && textOptions}
    </div>
  );
}

/**
 * Colors, sizes and smoothing for the pen or the marker.
 *   tool: 'pen' | 'highlighter'
 */
export function DrawingOptions({ ink, onInk, tool }) {
  const highlighter = tool === 'highlighter';
  const colors = highlighter ? HIGHLIGHT_COLORS : PEN_COLORS;
  const sizes = highlighter ? HIGHLIGHT_SIZES : PEN_SIZES;
  const color = highlighter ? ink.highlightColor : ink.penColor;
  const size = highlighter ? ink.highlightSize : ink.penSize;

  return (
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
      <span className="toolbar-sep" />
      {/* How much the line is smoothed out (0 = exactly as drawn) */}
      <label className="smooth-control" title="Smoothing">
        <span>Smooth</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={ink.smoothing}
          onChange={(e) => onInk({ smoothing: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
