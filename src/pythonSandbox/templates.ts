export type PythonSandboxKind = 'script' | 'manim'

export interface PythonSandboxTemplate {
  id: string
  label: string
  kind: PythonSandboxKind
  sceneName: string
  code: string
}

export const PYTHON_SANDBOX_TEMPLATES: PythonSandboxTemplate[] = [
  {
    id: 'matplotlib-curve',
    label: 'Matplotlib Curve',
    kind: 'script',
    sceneName: '',
    code: `import os
import numpy as np
import matplotlib.pyplot as plt

out = os.environ["LUFFY_OUTPUT_DIR"]

x = np.linspace(-6, 6, 500)
y = np.sin(x) / (1 + 0.08 * x ** 2)

plt.figure(figsize=(10, 5.625), dpi=160)
plt.plot(x, y, color="#8b5cf6", linewidth=4)
plt.fill_between(x, y, 0, color="#8b5cf6", alpha=0.18)
plt.axhline(0, color="#d4d4d8", linewidth=1)
plt.grid(True, alpha=0.22)
plt.title("Damped Sine Wave")
plt.tight_layout()
plt.savefig(os.path.join(out, "damped_sine.png"), transparent=True)
`,
  },
  {
    id: 'matplotlib-points',
    label: 'Data Points',
    kind: 'script',
    sceneName: '',
    code: `import os
import numpy as np
import matplotlib.pyplot as plt

out = os.environ["LUFFY_OUTPUT_DIR"]

x = np.array([1, 2, 3, 4, 5, 6, 7])
y = np.array([1.2, 2.1, 2.9, 4.4, 5.0, 6.3, 7.4])
m, b = np.polyfit(x, y, 1)

plt.figure(figsize=(10, 5.625), dpi=160)
plt.scatter(x, y, s=130, color="#22c55e", edgecolors="#052e16", linewidths=2)
plt.plot(x, m * x + b, color="#f97316", linewidth=3)
for px, py in zip(x, y):
    plt.text(px, py + 0.18, f"({px}, {py:.1f})", ha="center", fontsize=10)
plt.grid(True, alpha=0.25)
plt.tight_layout()
plt.savefig(os.path.join(out, "data_points.png"), transparent=True)
`,
  },
  {
    id: 'manim-equation',
    label: 'Manim Equation',
    kind: 'manim',
    sceneName: 'GeneratedScene',
    code: `from manim import *

class GeneratedScene(Scene):
    def construct(self):
        title = Text("Gradient Descent", font_size=44)
        eq = MathTex(r"\\theta_{t+1}=\\theta_t-\\eta\\nabla J(\\theta_t)", font_size=54)
        eq.next_to(title, DOWN, buff=0.6)

        self.play(Write(title))
        self.play(Write(eq))
        self.wait(0.7)
        self.play(eq.animate.scale(1.12).set_color(PURPLE))
        self.wait(0.8)
`,
  },
]
