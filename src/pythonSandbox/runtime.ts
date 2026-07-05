export type PythonSandboxKind = 'script' | 'manim'

export const PYTHON_SANDBOX_DEFAULT_CODE = `# Write your graph or animation code here.
# Available names: np, plt, animation, math, random, statistics, Path, out, WIDTH, HEIGHT, FPS.
# Save generated files inside out, for example:
# plt.savefig(os.path.join(out, "result.png"), transparent=True)
`

const BASE_PRELUDE = `import os
import math
import random
import statistics
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import animation

try:
    from manim import *
except Exception:
    pass

out = os.environ["LUFFY_OUTPUT_DIR"]
WIDTH = int(os.environ.get("LUFFY_WIDTH", "1920"))
HEIGHT = int(os.environ.get("LUFFY_HEIGHT", "1080"))
FPS = int(os.environ.get("LUFFY_FPS", "30"))`

export function getPythonSandboxPrelude(_kind: PythonSandboxKind) {
  return BASE_PRELUDE
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^\s*(import|from)\s+/m, label: 'Import statements are not allowed. Use the preloaded libraries above.' },
  { pattern: /\b__import__\s*\(/, label: '__import__ is not allowed.' },
  { pattern: /\bimportlib\b/, label: 'importlib is not allowed.' },
  { pattern: /\bpip\b|\bensurepip\b/, label: 'Installing packages from the sandbox is not allowed.' },
  { pattern: /\bsubprocess\b/, label: 'Starting subprocesses from the sandbox is not allowed.' },
  { pattern: /\bos\.(system|popen|spawn|exec|startfile)\b/, label: 'Shell/system calls are not allowed.' },
  { pattern: /\b(eval|exec|compile)\s*\(/, label: 'Dynamic code execution is not allowed.' },
]

export function validatePythonSandboxCode(code: string): string | null {
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(code)) return rule.label
  }
  return null
}
