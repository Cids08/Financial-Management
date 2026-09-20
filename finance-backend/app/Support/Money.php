<?php

namespace App\Support;

use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;

/**
 * Decimal arithmetic for money values.
 *
 * The finance services used to call the BCMath extension directly
 * (bcadd/bcsub/bcmul/bcdiv/bccomp). BCMath isn't enabled in every
 * deployment — when it's missing those calls fatal with "Call to
 * undefined function bccomp()". This wraps the same operations on top of
 * brick/math, which falls back to a pure-PHP calculator and never routes
 * the values through binary floats, so the math is identical with or
 * without the extension.
 *
 * Signatures intentionally mirror the bc* helpers (string in, string out,
 * scale defaults to 2 decimal places) so call sites stay simple.
 */
class Money
{
    public const SCALE = 2;

    public static function add(string|int|float $a, string|int|float $b, int $scale = self::SCALE): string
    {
        return self::toScale(BigDecimal::of((string) $a)->plus((string) $b), $scale);
    }

    public static function sub(string|int|float $a, string|int|float $b, int $scale = self::SCALE): string
    {
        return self::toScale(BigDecimal::of((string) $a)->minus((string) $b), $scale);
    }

    public static function mul(string|int|float $a, string|int|float $b, int $scale = self::SCALE): string
    {
        return self::toScale(BigDecimal::of((string) $a)->multipliedBy((string) $b), $scale);
    }

    public static function div(string|int|float $a, string|int|float $b, int $scale = self::SCALE): string
    {
        return (string) BigDecimal::of((string) $a)
            ->dividedBy((string) $b, $scale, RoundingMode::HalfUp);
    }

    /** Returns -1, 0 or 1. Mirrors bccomp(). */
    public static function comp(string|int|float $a, string|int|float $b, int $scale = self::SCALE): int
    {
        return BigDecimal::of((string) $a)
            ->toScale($scale, RoundingMode::HalfUp)
            ->compareTo(BigDecimal::of((string) $b)->toScale($scale, RoundingMode::HalfUp));
    }

    private static function toScale(BigDecimal $value, int $scale): string
    {
        return (string) $value->toScale($scale, RoundingMode::HalfUp);
    }
}
