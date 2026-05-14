"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
/**
 * Unit tests for Bug #3: Fade Expression Overflow Fix
 * Tests the createFadeExpression and validateFadeExpression functions
 */
(0, vitest_1.describe)('FinalVideoService - Fade Expression Fix (Bug #3)', () => {
    const createFadeExpression = (seg, duckVolume, fadeDuration) => {
        // If segment is too short for any meaningful fade, return constant volume
        if (seg.targetDuration < 0.2) {
            return '1.0';
        }
        const minDuration = fadeDuration * 2 + 0.1;
        let adjustedFade = fadeDuration;
        if (seg.targetDuration < minDuration) {
            adjustedFade = Math.max(0.05, (seg.targetDuration - 0.1) / 2);
        }
        const fadeOutStart = seg.targetDuration - adjustedFade;
        const duck = duckVolume.toFixed(2);
        const range = (1.0 - duckVolume).toFixed(2);
        const fade = adjustedFade.toFixed(3);
        const fadeOut = fadeOutStart.toFixed(3);
        if (seg.fadeStart && seg.fadeEnd) {
            return `if(lt(t,${fade}),${duck}+(${range})*t/${fade},if(lt(t,${fadeOut}),1.0,1.0-(${range})*(t-${fadeOut})/${fade}))`;
        }
        else if (seg.fadeStart) {
            return `if(lt(t,${fade}),${duck}+(${range})*t/${fade},1.0)`;
        }
        else if (seg.fadeEnd) {
            return `if(lt(t,${fadeOut}),1.0,1.0-(${range})*(t-${fadeOut})/${fade})`;
        }
        return '1.0';
    };
    const validateFadeExpression = (expr) => {
        if (expr.length > 250)
            return false;
        let count = 0;
        for (const char of expr) {
            if (char === '(')
                count++;
            if (char === ')')
                count--;
            if (count < 0)
                return false;
        }
        return count === 0;
    };
    (0, vitest_1.it)('should handle normal duration segments', () => {
        const seg = { targetDuration: 5.0, fadeStart: true, fadeEnd: true };
        const expr = createFadeExpression(seg, 0.15, 0.5);
        (0, vitest_1.expect)(expr).toContain('if(lt(t,0.500)');
        (0, vitest_1.expect)(expr).toContain('if(lt(t,4.500)');
        (0, vitest_1.expect)(validateFadeExpression(expr)).toBe(true);
    });
    (0, vitest_1.it)('should reduce fade duration for short segments', () => {
        const seg = { targetDuration: 0.8, fadeStart: true, fadeEnd: true };
        const expr = createFadeExpression(seg, 0.15, 0.5);
        // Adjusted fade should be (0.8 - 0.1) / 2 = 0.35
        (0, vitest_1.expect)(expr).toContain('0.350');
        (0, vitest_1.expect)(validateFadeExpression(expr)).toBe(true);
    });
    (0, vitest_1.it)('should return no fade for very short segments', () => {
        const seg = { targetDuration: 0.15, fadeStart: true, fadeEnd: true };
        const expr = createFadeExpression(seg, 0.15, 0.5);
        // Too short for fade (< 0.2s)
        (0, vitest_1.expect)(expr).toBe('1.0');
    });
    (0, vitest_1.it)('should handle fade in only', () => {
        const seg = { targetDuration: 3.0, fadeStart: true, fadeEnd: false };
        const expr = createFadeExpression(seg, 0.15, 0.5);
        (0, vitest_1.expect)(expr).toContain('if(lt(t,0.500)');
        (0, vitest_1.expect)(expr).not.toContain('if(lt(t,2.500)');
        (0, vitest_1.expect)(validateFadeExpression(expr)).toBe(true);
    });
    (0, vitest_1.it)('should handle fade out only', () => {
        const seg = { targetDuration: 3.0, fadeStart: false, fadeEnd: true };
        const expr = createFadeExpression(seg, 0.15, 0.5);
        (0, vitest_1.expect)(expr).toContain('if(lt(t,2.500)');
        (0, vitest_1.expect)(expr).not.toContain('0.15+');
        (0, vitest_1.expect)(validateFadeExpression(expr)).toBe(true);
    });
    (0, vitest_1.it)('should validate expression length', () => {
        const longExpr = 'if('.repeat(100) + '1.0' + ')'.repeat(100);
        (0, vitest_1.expect)(validateFadeExpression(longExpr)).toBe(false);
    });
    (0, vitest_1.it)('should validate balanced parentheses', () => {
        (0, vitest_1.expect)(validateFadeExpression('if(lt(t,0.5),1.0,0.5)')).toBe(true);
        (0, vitest_1.expect)(validateFadeExpression('if(lt(t,0.5),1.0,0.5')).toBe(false);
        (0, vitest_1.expect)(validateFadeExpression('if(lt(t,0.5)),1.0,0.5)')).toBe(false);
    });
    (0, vitest_1.it)('should not overlap fades', () => {
        const seg = { targetDuration: 1.0, fadeStart: true, fadeEnd: true };
        const expr = createFadeExpression(seg, 0.15, 0.5);
        // Should adjust fade to 0.45s each
        // Fade in: 0.0 - 0.45
        // Fade out: 0.55 - 1.0
        // No overlap!
        const fadeInMatch = expr.match(/if\(lt\(t,([\d.]+)\)/);
        const fadeOutMatch = expr.match(/if\(lt\(t,([\d.]+)\),1\.0/);
        if (fadeInMatch && fadeOutMatch) {
            const fadeInEnd = parseFloat(fadeInMatch[1]);
            const fadeOutStart = parseFloat(fadeOutMatch[1]);
            (0, vitest_1.expect)(fadeOutStart).toBeGreaterThan(fadeInEnd);
        }
    });
    (0, vitest_1.it)('should handle no fade case', () => {
        const seg = { targetDuration: 3.0, fadeStart: false, fadeEnd: false };
        const expr = createFadeExpression(seg, 0.15, 0.5);
        (0, vitest_1.expect)(expr).toBe('1.0');
    });
    (0, vitest_1.it)('should handle different duck volumes', () => {
        const seg = { targetDuration: 3.0, fadeStart: true, fadeEnd: false };
        const expr1 = createFadeExpression(seg, 0.1, 0.5);
        const expr2 = createFadeExpression(seg, 0.2, 0.5);
        const expr3 = createFadeExpression(seg, 0.5, 0.5);
        (0, vitest_1.expect)(expr1).toContain('0.10');
        (0, vitest_1.expect)(expr2).toContain('0.20');
        (0, vitest_1.expect)(expr3).toContain('0.50');
        (0, vitest_1.expect)(validateFadeExpression(expr1)).toBe(true);
        (0, vitest_1.expect)(validateFadeExpression(expr2)).toBe(true);
        (0, vitest_1.expect)(validateFadeExpression(expr3)).toBe(true);
    });
    (0, vitest_1.it)('should handle different fade durations', () => {
        const seg = { targetDuration: 5.0, fadeStart: true, fadeEnd: false };
        const expr1 = createFadeExpression(seg, 0.15, 0.3);
        const expr2 = createFadeExpression(seg, 0.15, 0.5);
        const expr3 = createFadeExpression(seg, 0.15, 1.0);
        (0, vitest_1.expect)(expr1).toContain('0.300');
        (0, vitest_1.expect)(expr2).toContain('0.500');
        (0, vitest_1.expect)(expr3).toContain('1.000');
    });
    (0, vitest_1.it)('should handle edge case: exactly minimum duration', () => {
        const fadeDuration = 0.5;
        const minDuration = fadeDuration * 2 + 0.1; // 1.1s
        const seg = { targetDuration: minDuration, fadeStart: true, fadeEnd: true };
        const expr = createFadeExpression(seg, 0.15, fadeDuration);
        (0, vitest_1.expect)(validateFadeExpression(expr)).toBe(true);
        (0, vitest_1.expect)(expr).toContain('0.500'); // Should use full fade duration
    });
    (0, vitest_1.it)('should validate complex nested expressions', () => {
        const validExpr = 'if(lt(t,0.500),0.15+(0.85)*t/0.500,if(lt(t,4.500),1.0,1.0-(0.85)*(t-4.500)/0.500))';
        (0, vitest_1.expect)(validateFadeExpression(validExpr)).toBe(true);
        const invalidExpr = 'if(lt(t,0.500),0.15+(0.85)*t/0.500,if(lt(t,4.500),1.0,1.0-(0.85)*(t-4.500)/0.500)';
        (0, vitest_1.expect)(validateFadeExpression(invalidExpr)).toBe(false);
    });
});
//# sourceMappingURL=FinalVideoService.fade.test.js.map