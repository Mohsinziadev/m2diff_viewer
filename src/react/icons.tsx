import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const Svg = ({ children, ...p }: IconProps) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...p}
  >
    {children}
  </svg>
);

export const IconArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </Svg>
);
export const IconArrowDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3.25 3.25" />
  </Svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
    <circle cx="10" cy="4.5" r="1.5" />
    <circle cx="6" cy="11.5" r="1.5" />
  </Svg>
);
export const IconFold = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 8h11M5 2.5 8 5.5l3-3M5 13.5l3-3 3 3" />
  </Svg>
);
export const IconUnfold = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 8h11M5 5 8 2l3 3M5 11l3 3 3-3" />
  </Svg>
);
export const IconExport = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5v8M4.5 6 8 2.5 11.5 6M3 10.5v2.25c0 .41.34.75.75.75h8.5c.41 0 .75-.34.75-.75V10.5" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);
export const IconCaseSensitive = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.3}>
    <path d="M1.5 12 4.25 4.5 7 12M2.4 9.6h3.7" />
    <circle cx="11.5" cy="9.75" r="2.25" />
    <path d="M13.75 7.5V12" />
  </Svg>
);
export const IconRegex = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.3}>
    <path d="M11 2.5v5M8.85 3.75l4.3 2.5M8.85 6.25l4.3-2.5" />
    <rect x="3" y="10" width="3" height="3" rx=".5" />
  </Svg>
);
export const IconWholeWord = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.3}>
    <path d="M1.5 13.5h13M1.5 11v2.5M14.5 11v2.5M4 4.5l1.5 5 1.5-4 1.5 4 1.5-5" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Svg>
);
export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5 14 13H2L8 2.5Z" />
    <path d="M8 6.5v3M8 11.25v.01" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 8.5 3 3 7-7" />
  </Svg>
);
export const IconChevronsRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.5 4 4 4-4 4M8.5 4l4 4-4 4" />
  </Svg>
);
export const IconChevronsLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12.5 4-4 4 4 4M7.5 4l-4 4 4 4" />
  </Svg>
);
