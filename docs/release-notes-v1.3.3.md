# Luffy Create v1.3.3 - Launch Release

This release prepares Luffy Create for public launch with stronger AI editing workflows, better media handling, smoother transitions, improved captions, richer styling controls, and updated public documentation.

## Highlights

- Repositioned Luffy Create as a free, open-source AI video editor with real timeline control.
- Added launch-ready GitHub Pages copy and a new launch blog page.
- Improved AI Edits so prompts can add scenes, text, images, videos, GIFs, and audio with better scene and media resolution.
- Added media mention support with `@` references for image, video, GIF, and audio assets.
- Added clearer uploaded asset naming for AI-friendly media references.
- Added AI sidebar API key settings UI placeholder for future model planner integration.

## Editor And Timeline Improvements

- Added direct audio drag-to-timeline behavior from the audio asset list.
- Fixed audio clips so short effects keep their original duration instead of being stretched by unwanted looping.
- Added stronger audio properties, including volume up to 200%.
- Improved audio fade controls with separate fade duration and target fade volume multipliers.
- Added visual selection feedback for timeline video blocks.
- Improved background image editing so image background adjustments can be controlled after setting an image as a scene background.
- Fixed preview so image backgrounds also appear in preview mode.

## Text, Shape, Media, And Styling

- Added drop shadow and inner shadow options for images, videos, shapes, and text-related workflows.
- Added solid and gradient fill controls for shapes with per-color opacity.
- Added text gradient support with up to three colors.
- Added thin font weight support and removed medium font weight from the editor controls.
- Added shape solid color opacity control.
- Added gradient border controls for shapes, images, and videos.
- Added animated gradient border support with speed control.
- Added icon size slider for easier icon resizing.

## Animation And Perspective

- Added text bounce enter animation.
- Added final scale size controls for Scale In and Scale Out animations, including larger scale ranges.
- Improved animation compatibility so multiple text enter animations can work together.
- Added precise move animation coordinates with cursor coordinate display.
- Improved perspective controls for images, videos, and shapes.
- Fixed perspective border rendering so borders remain usable after perspective edits.
- Fixed video border radius behavior when perspective transforms are applied.

## Backgrounds, Captions, And Sandbox

- Added animated three-color gradient backgrounds.
- Added grainy sand gradient background texture.
- Expanded automatic caption controls with styling options including font, size, color, gradient, background, emphasis, animation, and position margins.
- Improved Python Sandbox layout with larger output/console area.
- Added console copy support.
- Fixed Matplotlib animation sample compatibility issues.

## Preview, Export, And Transitions

- Reworked transition timing so export transitions run at the start of the entering scene and hold the previous scene stable.
- Smoothed fade, zoom, and morph transitions to avoid dark or blank-frame flashes.
- Updated preview modal to use the same transition timing model as export.
- Improved export capture around video scenes by waiting for visible videos to be ready and seeked before frame capture.
- Fixed export reliability issues around stage availability and encoding hangs.

## Documentation And Launch Assets

- Updated the GitHub Pages homepage with the improved product positioning and feature list.
- Added `docs/blog/luff-create-best-free-ai-video-editor.html` as the first launch blog page.
- Updated README feature descriptions, install notes, docs links, and public messaging.
- Added release notes for this launch-ready version.

## Upgrade Notes

- Version: `1.3.3`
- Existing projects should continue to open normally.
- Unsigned builds may still show operating-system security warnings. The source is public, and users can build from source if preferred.
