/** Shared circular AI badge using the original brand image. */
export default function AiLogo({ size = 20, className = '' }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size }}
      className={`ai-logo-badge inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle ${className}`.trim()}>
      <img src="/images/ai-logo.png" alt="" className="h-[82%] w-[82%] object-contain" />
    </span>
  )
}
