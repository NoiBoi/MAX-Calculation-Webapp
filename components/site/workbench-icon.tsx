const paths = {
  calculator: "M5 2.5h10v15H5z M7.5 5h5 M7.5 9h1 M11.5 9h1 M7.5 12h1 M11.5 12h1 M7.5 15h1 M11.5 15h1",
  comparison: "M3 3.5h6v13H3z M12 3.5h5v13h-5z M5 7h2 M5 10h2 M14 7h1 M14 10h1",
  emi: "M1.5 10h2.3c2.2 0 2.1-5 4.2-5 2.6 0 2.2 10 4.8 10 2 0 2.1-5 4.3-5h1.4",
  xrd: "M2.5 3v14h15 M4 14h2l1.8-5 2 5h1.5l2.4-9 2 9h1.8",
  labs: "M7 2.5h6 M8 2.5v6l-4.3 6.6A1.4 1.4 0 0 0 5 17.5h10a1.4 1.4 0 0 0 1.3-2.4L12 8.5v-6 M6 12h8",
  settings: "M3 5h14 M3 10h14 M3 15h14 M7 3v4 M13 8v4 M8 13v4",
  empty: "M5 2.5h7l3 3v12H5z M11.5 2.5V6h3.5 M8 9.5h4 M8 13h4",
} as const;

export function WorkbenchIcon({ name }: { readonly name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" className="workbench-icon" fill="none" viewBox="0 0 20 20">
      <path d={paths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
    </svg>
  );
}
