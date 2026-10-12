// Small line icons, drawn as inline SVG (no icon library needed).
// They use currentColor, so they take the text color of their button.

function Icon({ children, size = 22, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const BackIcon = (p) => <Icon {...p}><path d="M15 18l-6-6 6-6" /></Icon>;
export const PlusIcon = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const CloseIcon = (p) => <Icon {...p}><path d="M18 6L6 18M6 6l12 12" /></Icon>;
export const CheckIcon = (p) => <Icon {...p}><path d="M20 6L9 17l-5-5" /></Icon>;
export const MoreIcon = (p) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </Icon>
);
export const PagesIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="3" width="7" height="8" rx="1" />
    <rect x="13" y="3" width="7" height="8" rx="1" />
    <rect x="4" y="13" width="7" height="8" rx="1" />
    <rect x="13" y="13" width="7" height="8" rx="1" />
  </Icon>
);
export const FitWidthIcon = (p) => (
  <Icon {...p}>
    <path d="M3 5v14M21 5v14" />
    <path d="M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3" />
  </Icon>
);
export const CropIcon = (p) => (
  <Icon {...p}>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </Icon>
);
export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </Icon>
);
export const GripIcon = (p) => (
  <Icon {...p}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="3" />
  </Icon>
);
export const ImportIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Icon>
);
export const PasteIcon = (p) => (
  <Icon {...p}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="M9 10h6M9 14h6" />
  </Icon>
);
export const TextIcon = (p) => (
  <Icon {...p}>
    <path d="M5 6V4h14v2M12 4v16M9 20h6" />
  </Icon>
);
export const FolderIcon = (p) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
);
export const NewFolderIcon = (p) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 10v6M9 13h6" />
  </Icon>
);
export const ChevronIcon = (p) => <Icon {...p}><path d="M9 6l6 6-6 6" /></Icon>;
export const PageIcon = (p) => (
  <Icon {...p}>
    <path d="M6 2h9l5 5v15H6z" />
    <path d="M14 2v6h6" />
  </Icon>
);
export const HandIcon = (p) => (
  <Icon {...p}>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </Icon>
);
export const NoteIcon = (p) => (
  <Icon {...p}>
    <path d="M4 4h16v11l-5 5H4z" />
    <path d="M15 20v-5h5" />
  </Icon>
);
export const TapeIcon = (p) => (
  <Icon {...p}>
    <path d="M3 8.5l2-1 1.5 1 1.5-1h11l1.5 1 1.5-1v7l-1.5 1-1.5-1H8l-1.5 1-1.5-1-2 1z" />
    <path d="M9 10.5l2 2M13 10.5l2 2" opacity="0.6" />
  </Icon>
);
export const UndoIcon = (p) => (
  <Icon {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </Icon>
);
export const RedoIcon = (p) => (
  <Icon {...p}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </Icon>
);
export const EyeIcon = (p) => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const PenIcon = (p) => (
  <Icon {...p}>
    <path d="M17 3l4 4L8 20l-5 1 1-5z" />
    <path d="M14.5 5.5l4 4" />
  </Icon>
);
export const HighlighterIcon = (p) => (
  <Icon {...p}>
    <path d="M9 11l-5 5v3h3l5-5" />
    <path d="M13.5 6.5l4 4L12 16l-4-4z" />
    <path d="M15 5l4 4" />
    <path d="M3 22h8" strokeWidth="3" opacity="0.5" />
  </Icon>
);
export const LinkIcon = (p) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Icon>
);
export const LassoIcon = (p) => (
  <Icon {...p}>
    <path d="M7 17c-2.5-1.2-4-3-4-5.2C3 7.5 7 4 12 4s9 3.5 9 7.8-4 7.2-9 7.2c-1.2 0-2.3-.2-3.3-.5" strokeDasharray="3 2.6" />
    <path d="M8.7 18.5c0 1.4-1 2.5-2.3 2.5" />
  </Icon>
);
export const ZoomWindowIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="4" width="8" height="6" rx="1" strokeDasharray="2.5 2" />
    <rect x="3" y="13" width="18" height="8" rx="1.5" />
    <path d="M7 10v3" />
  </Icon>
);
export const PaletteIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
    <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
    <circle cx="10.5" cy="7" r="1.2" fill="currentColor" />
    <circle cx="15" cy="7.5" r="1.2" fill="currentColor" />
  </Icon>
);
export const ExpandIcon = (p) => (
  <Icon {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);
export const EraserIcon = (p) => (
  <Icon {...p}>
    <path d="M7 21h10" />
    <path d="M5.5 14.5l8.6-8.6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H9z" />
    <path d="M9.5 10.5l5 5" />
  </Icon>
);
export const KeyboardIcon = (p) => (
  <Icon {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Icon>
);
export const StudyIcon = (p) => (
  <Icon {...p}>
    <path d="M22 10L12 5 2 10l10 5 10-5z" />
    <path d="M6 12v5c3 2.5 9 2.5 12 0v-5" />
  </Icon>
);
export const ShareIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v13M7 8l5-5 5 5" />
    <path d="M5 12v8h14v-8" />
  </Icon>
);
