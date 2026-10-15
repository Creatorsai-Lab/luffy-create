# AI Agent Guide

The AI Agent turns plain-English requests into editor edits. It runs entirely on
your computer (no account, API key or internet), and it always shows a plan
before anything changes.

## How It Works

1. Open a project.
2. Type a request in the AI Agents sidebar.
3. Review the pending plan. Anything the agent did not understand is listed
   above it.
4. Click **Apply**. The whole plan is one undo step.

## Several Steps In One Request

Separate steps with "and", "then", commas or new lines:

```text
Add a title 'Intro' at the top and make it fade in, then split scene 2 at 3s
```

"It" means what the previous step created or changed.

## Referring To Things

| You write | It means |
|---|---|
| `scene 3`, `slide 3`, `the last scene`, `this scene` | One scene |
| `scenes 2-4`, `scene 1 and 3`, `all scenes` | Several scenes |
| `the title` | The largest text on the scene |
| `the red circle`, `the video`, `the music`, `the voiceover` | An item by kind and colour |
| `'Welcome'` (in quotes) | The text item that says that |
| `Logo Box` | An item by its layer name |
| `this`, `selected` | The current selection |
| `all text`, `all images` | Every item of that kind on the scene |

When a request is ambiguous ("the circle" with three circles on the scene), the
agent asks you to select one or use its name instead of guessing.

## What You Can Ask

**Scenes**

```text
Add a new scene with title 'Chapter 2'
Add a 5 second scene after scene 2
Delete scenes 2-4
Duplicate scene 1
Split scene 2 at 3s          Split here          Split scene 3 into 3 parts
Make all scenes 3s long      Extend scene 1 by 2s
Trim the first 2 seconds of scene 3
Move scene 4 before scene 2  Swap scene 1 and 3
```

**Transitions and backgrounds**

```text
Use wipe transitions between all scenes
Add a zoom transition to scene 2 lasting 1s
Remove all transitions
Make the background dark blue
Gradient background from purple to pink
```

**Adding items**

```text
Add title "Huber Loss" at the top with font size 72
Add a red circle with a white border in the bottom right
Add @clip.mp4 to scene 3
Add song.mp3 at 2s
```

**Changing items**

```text
Make the title bigger        Make the circle twice as big
Make the red circle blue     Change the circle's border to white
Change the title text to 'Hello world'
Use Poppins for 'Welcome'    Make all text bold
Set opacity of the logo to 50%
Center the title             Move the logo to the top right
Rotate the logo by 45 degrees
Bring the logo to the front
```

**Animation**

```text
Fade in the title            Fade out the text 'Thanks' over 2s
Slide in the image from the left over 1s
Make it spin                 Add typewriter to the title
Move the selected item to the right with speed 400 and delay 1.2 seconds
```

**Audio and video**

```text
Mute the video               Set the music volume to 30%
Make the voiceover louder    Speed up the video 2x
Fade in the music over 2s    Loop the music
Trim the first 2 seconds of the video
```

**Smart edits** (the agent listens to or watches your media first)

```text
Remove silences              Remove pauses longer than 1s        Tighten the pauses
Remove filler words          Cut all the ums and uhs
Cut to the beat              Cut to the beat every 2 beats       Cut on every bar
Split the video into shots   Detect camera cuts in scene 2
```

- **Silences** are found by loudness and cut out of each scene's video clip,
  keeping a little breathing room next to speech.
- **Filler words** ("um", "uh", "er", "hmm") come from local Whisper with word
  timings. Those timings are approximate, so play the result back; when a filler
  runs straight into the next word it can be missed.
- **Cut to the beat** finds the tempo of the background music and moves scene
  ends to the nearest beat.
- **Shots** are found where the picture changes suddenly; each becomes its own
  scene.

Run smart edits as their own request. They plan against the project as it is
when you press send.

## Safety And Limits

- Every plan is validated before Apply: scene numbers that don't exist, missing
  assets and unresolvable items are reported and removed, values are clamped.
- The agent only uses assets already in the project.
- A project always keeps at least one scene.
- Use **Undo** to roll back an applied plan in one step.
