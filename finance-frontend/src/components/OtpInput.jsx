import { useEffect, useRef } from 'react'

/**
 * Segmented OTP / Verification Code Input (digit by digit).
 * Supports typing, backspace, arrow keys, paste (full code), and auto-advance.
 *
 * Props:
 *  - length: number of digits (default: 6)
 *  - value: current string code (e.g. "123456")
 *  - onChange: callback with updated code string
 *  - onComplete: optional callback when all digits are filled
 *  - disabled: boolean
 *  - autoFocus: boolean (focuses first box on mount)
 *  - hasError: boolean (highlights boxes in red)
 */
export default function OtpInput({
  length = 6,
  value = '',
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true,
  hasError = false,
}) {
  const inputRefs = useRef([])

  // Convert incoming string value to an array of single characters
  const digits = Array.from({ length }, (_, i) => value[i] || '')

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus()
    }
  }, [autoFocus])

  const setDigits = (newDigits) => {
    const newCode = newDigits.join('')
    onChange(newCode)
    if (newCode.length === length && onComplete) {
      onComplete(newCode)
    }
  }

  const handleChange = (index, e) => {
    const raw = e.target.value
    // Extract only digits
    const cleaned = raw.replace(/\D/g, '')

    if (!cleaned) {
      // Cleared the digit
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }

    // If more than 1 character was entered (e.g. mobile keyboard autocomplete or paste)
    if (cleaned.length > 1) {
      handleMultiInput(index, cleaned)
      return
    }

    // Single digit entered
    const char = cleaned.slice(-1)
    const next = [...digits]
    next[index] = char
    setDigits(next)

    // Move to next box if not the last
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus()
      inputRefs.current[index + 1]?.select()
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Current box is already empty, move to previous box and clear it
        e.preventDefault()
        const next = [...digits]
        next[index - 1] = ''
        setDigits(next)
        inputRefs.current[index - 1]?.focus()
      } else if (digits[index]) {
        // Clear current box
        e.preventDefault()
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
      inputRefs.current[index - 1]?.select()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault()
      inputRefs.current[index + 1]?.focus()
      inputRefs.current[index + 1]?.select()
    } else if (e.key === 'Delete') {
      e.preventDefault()
      const next = [...digits]
      next[index] = ''
      setDigits(next)
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return

    const next = Array.from({ length }, (_, i) => pasted[i] || '')
    setDigits(next)

    // Focus the box following the last pasted digit or the last box
    const targetIdx = Math.min(pasted.length, length - 1)
    inputRefs.current[targetIdx]?.focus()
  }

  const handleMultiInput = (startIndex, str) => {
    const chars = str.split('').slice(0, length - startIndex)
    const next = [...digits]
    chars.forEach((c, idx) => {
      if (startIndex + idx < length) {
        next[startIndex + idx] = c
      }
    })
    setDigits(next)
    const nextFocus = Math.min(startIndex + chars.length, length - 1)
    inputRefs.current[nextFocus]?.focus()
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5 my-3" onPaste={handlePaste}>
      {digits.map((digit, idx) => {
        const isFilled = Boolean(digit)
        return (
          <input
            key={idx}
            ref={(el) => (inputRefs.current[idx] = el)}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={2} // Allows overwriting existing digit
            disabled={disabled}
            value={digit}
            onChange={(e) => handleChange(idx, e)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onFocus={(e) => e.target.select()}
            className={`h-12 w-10 sm:h-13 sm:w-11 rounded-xl text-center font-mono text-xl font-bold
              transition-all duration-150 outline-none
              ${
                hasError
                  ? 'border-2 border-red-500 bg-red-50/50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                  : isFilled
                    ? 'border-2 border-primary bg-primary/5 text-ink dark:bg-primary/10 shadow-sm'
                    : 'border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 text-ink shadow-xs'
              }
              focus:border-primary focus:ring-2 focus:ring-primary/30 focus:bg-white dark:focus:bg-slate-900
              disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={`Digit ${idx + 1}`}
          />
        )
      })}
    </div>
  )
}

