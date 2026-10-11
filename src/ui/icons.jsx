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
export const PageIcon = (p) => (
  <Icon {...p}>
    <path d="M6 2h9l5 5v15H6z" />
    <path d="M14 2v6h6" />
  </Icon>
);
export const ShareIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v13M7 8l5-5 5 5" />
    <path d="M5 12v8h14v-8" />
  </Icon>
);
