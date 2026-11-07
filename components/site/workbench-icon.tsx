const paths = {
  calculator: "M5 2.5h10v15H5z M7.5 5h5 M7.5 9h1 M11.5 9h1 M7.5 12h1 M11.5 12h1 M7.5 15h1 M11.5 15h1",
  comparison: "M3 3.5h6v13H3z M12 3.5h5v13h-5z M5 7h2 M5 10h2 M14 7h1 M14 10h1",
  emi: "M1.5 10h2.3c2.2 0 2.1-5 4.2-5 2.6 0 2.2 10 4.8 10 2 0 2.1-5 4.3-5h1.4",
  xrd: "M2.5 3v14h15 M4 14h2l1.8-5 2 5h1.5l2.4-9 2 9h1.8",
  labs: "M7 2.5h6 M8 2.5v6l-4.3 6.6A1.4 1.4 0 0 0 5 17.5h10a1.4 1.4 0 0 0 1.3-2.4L12 8.5v-6 M6 12h8",
  settings: "M3 5h14 M3 10h14 M3 15h14 M7 3v4 M13 8v4 M8 13v4",
  more: "M3 10h1.5 M9.25 10h1.5 M15.5 10H17",
  add: "M10 4v12 M4 10h12",
  close: "M5 5l10 10 M15 5 5 15",
  up: "M10 16V4 M5 9l5-5 5 5",
  down: "M10 4v12 M5 11l5 5 5-5",
  undo: "M7 4 3 8l4 4 M3 8h9a4 4 0 0 1 0 8h-2",
  redo: "M13 4l4 4-4 4 M17 8H8a4 4 0 0 0 0 8h2",
  empty: "M5 2.5h7l3 3v12H5z M11.5 2.5V6h3.5 M8 9.5h4 M8 13h4",
  light: "M10 1v2 M10 17v2 M1 10h2 M17 10h2 M3.6 3.6 5 5 M15 15l1.4 1.4 M3.6 16.4 5 15 M15 5l1.4-1.4 M14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  dark: "M16.8 12.3A7.2 7.2 0 0 1 7.7 3.2a7.2 7.2 0 1 0 9.1 9.1",
  midnight: "M15.8 11.5a6.4 6.4 0 0 1-7.3-8.3 6.7 6.7 0 1 0 7.3 8.3 M15 2v4 M13 4h4",
  system: "M2.5 3.5h15v10h-15z M10 13.5v3 M6.5 16.5h7",
  chevron: "M5 7.5l5 5 5-5",
  check: "M4 10l4 4 8-8",
} as const;

export function WorkbenchIcon({ name }: { readonly name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" className="workbench-icon" fill="none" viewBox="0 0 20 20">
      <path d={paths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
    </svg>
  );
}
