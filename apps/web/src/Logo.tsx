export function Logo({ size = 32 }: { readonly size?: number }) {
  return (
    <div className="logo">
      <img className="logoIcon" src="/logo-mark.svg" alt="" style={{ height: size }} />
      <span className="logoText">Sleevy</span>
    </div>
  )
}
