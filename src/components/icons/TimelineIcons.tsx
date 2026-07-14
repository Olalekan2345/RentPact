import type { SVGProps } from "react";

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth={1.75} />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h1.4l.9-1.6h8.4l.9 1.6h1.4A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.25" stroke="currentColor" strokeWidth={1.75} />
    </svg>
  );
}

export function WrenchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M14.7 9.3a3.5 3.5 0 0 1-4.6 4.6L5 19l-2-2 5.1-5.1a3.5 3.5 0 0 1 4.6-4.6l-2.4 2.4 1.7 1.7 2.4-2.4z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ScaleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 3.5v17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M7.5 19h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M4 6.5h6M14 6.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M4 6.5L1.75 11a2.25 2.25 0 0 0 4.5 0L4 6.5zM20 6.5l-2.25 4.5a2.25 2.25 0 0 0 4.5 0L20 6.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WarningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 4.5l9 15.5H3l9-15.5z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export function FrostIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <g stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        <path d="M12 3.5v17" />
        <path d="M4.4 7.25l15.2 9.5" />
        <path d="M19.6 7.25L4.4 16.75" />
        <path d="M12 3.5l-2 2M12 3.5l2 2" />
        <path d="M12 20.5l-2-2M12 20.5l2-2" />
        <path d="M4.4 7.25l0.4 2.6M4.4 7.25l2.5-.8" />
        <path d="M19.6 16.75l-.4-2.6M19.6 16.75l-2.5.8" />
      </g>
    </svg>
  );
}
