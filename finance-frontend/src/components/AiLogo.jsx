/**
 * AI brand mark, served from public/images so it ships with the frontend
 * bundle rather than as a cross-origin request to the API.
 *
 * Single component so every AI touchpoint stays visually consistent and
 * there is one place to change the asset or sizing later. alt is empty
 * because the mark is decorative and always sits beside a text label, so
 * announcing it would just be noise for screen reader users.
 */
export default function AiLogo({ size = 16, className = '' }) {
  return (
    <img
      src="/images/ai-logo.png"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 align-middle ${className}`.trim()}
    />
  )
}