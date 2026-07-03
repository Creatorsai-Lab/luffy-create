# Luffy Editor Feature Release - July 2026

This release focuses on making Luffy Editor more practical for real video production: richer animation controls, stronger timeline editing, smoother media preview, better audio tooling, smarter charts, and several stability fixes found while editing recovery projects.

## New Features

- Added a dedicated Move tool for selected slide objects, with direction controls, speed, delay, and an option to move objects outside the scene boundary.
- Added a Perspective options panel so perspective editing can stay active while selecting different objects, with value-based controls alongside direct canvas handles.
- Added Color Pulse loop animation for text, including pulse color, count, duration, and delay controls.
- Added support for animation delays up to 60 seconds across element animation panels.
- Added a data points chart with configurable X/Y ranges, intervals, point color, point size, coordinate labels, and animation support.
- Added optional regression line support for data point charts, with start/end coordinates, line color, width, and animation integration.
- Added shift-drag reordering in the Layers panel for faster layer ordering on crowded scenes.
- Added scene timeline context actions: split scene at the clicked position and add scene after the selected scene block.
- Added a dedicated audio properties sidebar for selected timeline audio blocks.
- Added granular audio speed controls with both a slider and preset values from 0.25x to 2x.
- Added audio voice shaping controls for voice tone, pitch, bass, and saturation.
- Added an AI command foundation under `src/ai` with structured editor commands for future assistant-driven editing workflows.

## Media And Timeline Updates

- Improved video blocks in the timeline to show scene-frame previews instead of a stretched single thumbnail.
- Removed the distracting violet video timeline overlay and cleaned up the video block presentation.
- Improved video loop handling so looped clips can fill longer scene durations and show loop state in the timeline.
- Increased spacing around timeline video blocks for clearer editing.
- Updated preview/timeline video playback behavior so video elements remain playable during preview instead of freezing after the first seconds.
- Improved exported audio mixing to include audio from unmuted video elements, not only standalone audio tracks.

## Editor Improvements

- Moved audio editing controls out of the crowded timeline header and into the sidebar.
- Removed unused audio trim and advanced audio sections from the audio properties panel.
- Cleaned up shape picker UI by removing always-visible labels while keeping hover labels.
- Improved code block selection so code block style and layout options open correctly again.
- Improved image insertion so uploaded images keep their original aspect ratio.
- Confirmed and preserved GIF upload/playback support so animated GIFs are not flattened during editing.

## Transitions And Animation

- Cleaned up duplicate transition entries.
- Smoothed transition behavior to reduce vibration and unstable motion.
- Improved Morph transition logic so matching text and media elements animate more naturally between slides, including font-size changes.
- Improved animation handling for chart regression lines and data point visuals.

## Bug Fixes

- Fixed perspective-edited images resizing only their wrapper instead of resizing the visible image content.
- Removed the unwanted perspective grid/diagonal overlay that appeared on perspective-transformed images.
- Fixed chart insertion so clicking chart items adds the selected chart and opens its properties.
- Fixed layer panel dragging so shift-drag reorders layers instead of immediately opening the selected element panel.
- Fixed audio split timing so split audio respects playback speed when calculating the new start time.
- Fixed export audio mismatch where preview/timeline volume could sound correct but exported video missed video-element audio.
- Added fallback audio export paths so projects can still export if a video source has no audio stream.

## Stability And Project Recovery

- Reviewed local autosave/project storage behavior during recovery work.
- Recovered usable project data from local app storage where possible.
- Identified recovery artifacts that should stay outside release commits.

## Verification

- TypeScript validation passed with `npx tsc --noEmit`.
- Production build passed with `npm run build`.
