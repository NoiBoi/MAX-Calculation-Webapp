export function CreatorCredit({ className = "creator-credit" }: { readonly className?: string }) {
  return <footer className={className}>
    <span>Built by Matthew Deng</span>
    <span aria-hidden="true">·</span>
    <a href="mailto:deng301@purdue.edu">deng301@purdue.edu <span className="credit-inquiry">for inquiries</span></a>
    <span aria-hidden="true">·</span>
    <span>Built for the Anasori Lab</span>
  </footer>;
}
