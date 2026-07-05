# Python Sandbox Guide

Python Sandbox lets you create graph images and math animation outputs from Python code, then save or insert the generated files into the editor.

Open it from **Menu Sidebar > Python Sandbox**.

## What It Is Best For

- Matplotlib graphs
- Data visualizations
- Transparent PNG chart assets
- Manim math animations
- Educational visual elements for explainer videos

## How To Use

1. Open a project.
2. Open **Python Sandbox** from the menu sidebar.
3. Choose **Python Script** or **Manim Scene**.
4. Write code in the editable code panel.
5. Click **Run**.
6. Preview the generated output.
7. Use **Save to Assets** or **Insert**.

Generated files are detected automatically when they are saved inside the provided `out` folder.

## Sandbox Environment

Released builds include a bundled Python Sandbox runtime with the required packages already installed: NumPy, Matplotlib, Pillow, SciPy, ImageIO, ImageIO FFmpeg support, and Manim. Users should not need to install these packages on their computer.

For local development or recovery, the app can still create a local repair sandbox in the app data folder when a bundled runtime is not available. Release builds should prepare the bundled runtime before packaging:

```bash
npm run prepare-python-sandbox
```

Then package the app normally:

```bash
npm run package
```

## Preloaded Libraries

The sandbox preloads common libraries and variables. You should use these directly instead of writing import lines.

Available names include:

```python
np
plt
animation
math
random
statistics
Path
out
WIDTH
HEIGHT
FPS
```

For Manim scenes, common Manim names are also preloaded when Manim is installed.

## Important Rule

Do not write import lines in the editable code area.

Blocked examples:

```python
import numpy as np
from manim import *
```

The sandbox already provides the supported libraries. If an import line is present, Run will be disabled or rejected until you remove it.

## Matplotlib Example

```python
x = np.linspace(-5, 5, 300)
y = x ** 2

plt.figure(figsize=(10, 5.625), dpi=160)
plt.plot(x, y, color="#8b5cf6", linewidth=4)
plt.grid(True, alpha=0.25)
plt.tight_layout()
plt.savefig(os.path.join(out, "parabola.png"), transparent=True)
```

## Manim Example

Use the scene class name shown in the Scene class field.

```python
class GeneratedScene(Scene):
    def construct(self):
        title = Text("Huber Loss", font_size=48)
        formula = MathTex(r"L_\delta(a)")
        formula.next_to(title, DOWN, buff=0.5)

        self.play(Write(title))
        self.play(Write(formula))
        self.wait(1)
```

## Getting Better Results

- Save outputs inside `out`.
- Use clear filenames such as `loss_curve.png` or `gradient_descent.mp4`.
- Use transparent backgrounds for overlays when possible.
- Match the project aspect ratio with `WIDTH`, `HEIGHT`, and `FPS`.
- For graphs, use large figure size and high DPI for sharp exports.
- For Manim, keep scene class names simple and match the selected class field.
- Use **Insert** when you want the generated file placed directly on the current scene.
- Use **Save to Assets** when you want to keep the generated file for later.

## Safety And Limits

The sandbox blocks import statements, package installation attempts, subprocess calls, and dynamic execution helpers such as `eval` and `exec`. This keeps the feature focused on creating editor assets with the supported preloaded tools.
