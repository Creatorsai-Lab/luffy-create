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
Add whip pan transitions between all scenes
Add a strong zoom blur transition to scene 2
Add a push transition from the left to scene 3
Add a dip to white transition to scene 2
Cinematic transitions between all scenes
Fade in from black at the start              Start the video with an iris
Fade out to black at the end                 End the video with a dip to white
Remove the fade at the end                   Remove all transitions
Make the background dark blue
Gradient background from purple to pink
```

Transition names: Dissolve (fade, crossfade), Dip to black / white, Push, Slide,
Wipe, Zoom in, Zoom out, Iris (circle), Whip pan (swish, swipe), Zoom blur
(crash zoom), Spin, Blur dissolve, Light leak, Film burn, Luma fade, Flash,
Glitch (RGB split), Pixelate (mosaic), Stretch, Slices (strips, blinds), Flash
Blur, Flicker Shake, Cube (3D) and Morph. "Smooth" means a dissolve,
"cinematic" a blur dissolve and "quick" or "energetic" a whip pan; "strong" and
"subtle" set the strength. A name the editor doesn't have is reported instead
of quietly becoming a fade. A transition on the first scene is an intro from
black; "at the end" sets the fade-out after the last scene.

**Effects, speed ramps and freeze frames** (videos and images)

```text
Add a neon outline to me                    Add a pink neon outline to the image
Make the video look like VHS                Old film look on the video
Phonk edit on the beat                      Add an RGB split on the beat
Give the video a teal and orange look       Make it black and white
Add a strong glitch from 2s to 4s           Add a subtle light leak for the first 3 seconds
Add film grain     Add a lens flare     Warp the video     Add rain to the photo
Remove the glitch                           Remove all effects from the video
Velocity edit      Slow-mo start      Bullet time      Hero time
Freeze the frame at 2s for 1.5s             Remove the freeze frame
Remove the speed ramp
```

Every effect in the Effects panel is understood by name ("neon", "vhs", "8mm",
"glitch", "chromatic aberration", "kaleidoscope", "god rays", "phonk",
"zoom pulse", "handheld shake", "ken burns"…); a colour look is one of
Cinematic, Teal & orange, Warm, Cool, Vintage, Faded film, Bleach bypass, Vivid,
Cyberpunk, Sunset, Monochrome or Noir. "Strong" / "subtle" set the strength,
"on the beat" syncs it to the music, and "from 2s to 4s" / "for the first 3
seconds" set when it runs. Words that are also animations ("glow", "flash",
"float", "shake") mean the clip only when you name it, select it or just
talked about it — "make the title glow" still animates the title. A clip cut
into parts gets the effect in every part. Speed ramps and freeze frames work on
videos; the clip's length changes and the scene follows.

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

**Sequences (many items, one after another)**

```text
Fade in all circles one by one 0.2s apart
Make all text appear one after another starting at 2s
Pulse all circles left to right one by one, then flash them red right to left and repeat
Flash all circles yellow layer by layer and repeat every 4s
```

"Layer by layer" (or "columns together") animates items lined up in a column at
once. A wave right after another ("…, then flash them …") joins the same
sequence, mirrors its timing, and they repeat together.

**Connectors** (arrows that stay attached and follow their items)

```text
Connect the title to the logo box
Connect the logo box to all circles
Connect all circles in a chain
Fully connect the circles layer by layer with thin red lines
Connect the selected items
Add a red circle in the bottom right and connect it to the title
```

**Groups**

```text
Group all circles as 'Layer 1'
Group the selected items
Make the layer 1 group blue
Ungroup the group
```

A group's name (or "the group", when the scene has one) refers to all of its
members.

**Audio ducking**

```text
Duck the music
Duck the music to 15% with a 0.5s fade
Lower the background music by 80% when I talk
Duck the music by -12dB
Remove the ducking
```

Ducking listens to every unmuted video clip and voiceover track, finds where
someone talks and lowers the music (background-track audio) there with
volume automation. "to 20%" is the music level while talking; "by 80%" lowers
it by that much. Run it again after editing.

**Split screen**

```text
Split screen                       (side by side; stacked in a vertical video)
Put the image and the video side by side
Stack the clips with a 20px gap
```

**Putting clips in an area of the frame**

```text
Make video 1 full screen and video 2 bottom right at 400x300
Make this video fill the screen and this one show in the bottom right at 30%
Put the video in the upper half and the image in the lower half
Put one video in the left half and the other in the right half
Put the video in the top third        the left 60%        the top left quarter
Put the video at x 100 y 200, 500px wide
Fit the whole video in the upper half (no crop)     Stretch the video to fill the screen
Add intro.mp4 to the upper half
```

The agent works out exact pixels from the scene size: the upper half of a
1080×1920 scene is 1080×960 at (0, 0); the right half of 1920×1080 is
960×1080 at (960, 0). The plan preview shows the numbers.

- **Which clip:** its name, "video 1" / "video_id_2" / "the second video"
  (in the order they were added), "this video" (the 1st "this" is the 1st
  selected clip, the 2nd the 2nd), "one … the other", or "it".
- **Fit:** clips are cropped to fill their area, centred on what they showed
  (cover). "fit" / "without cropping" shows the whole clip as large as fits;
  "stretch" fills the area and distorts. With only a width ("480px wide",
  "at 30%") the height follows the clip's shape.
- **Corners and edges** keep a small margin (3% of the short side, 32 px at
  1080p); say "no margin" or "with 50px margin". A big clip sent to a corner
  without a size shrinks to 30% of the width (42% in vertical video); a small
  one just moves there.
- A clip that fills the frame goes behind everything; a smaller clip on top
  of a bigger one comes to the front.

**Auto reframe (follow the face)**

```text
Reframe the video for vertical        Auto reframe for TikTok
Follow the speaker's face             (keeps the clip's size and place)
Keep my face centred and keep the camera steady
Track the face in video 2 closely
Stop following the face
```

The agent finds faces in the clip on this computer (MediaPipe face
detection, bundled with the app), then moves the crop to keep the main
speaker in frame. "for vertical / TikTok / fill / full screen" first makes
the clip cover the frame; otherwise it keeps its box and only the crop
moves (a clip that already shows its whole picture has no room to move —
the agent says so). Framing: still per shot when the speaker barely moves,
a smooth pan when they move ("steady" / "closely" force one or the other),
a cut when the shot cuts, a little head room above the face.

**Captions**

```text
Hormozi style captions             Use the karaoke preset for the captions
Make the captions yellow with a black outline
Captions in all caps with a dark box behind
Highlight the spoken word in green in the captions
Make the captions bigger and move them to the bottom
Hide the captions
```

Presets: Bold, Karaoke, Boxed, Minimal, Pop. Styles apply to the project's
caption track; without captions yet, the style is saved and used when you
generate them.

**Add-ons**

```text
Add a title card 'Chapter 2' with subtitle 'Setup' on scene 3
Add a boxed title card 'Results' in red
Add a lower third for 'Adya' 'ML engineer' on the right
Add a hook 'Stop scrolling, this changes everything' highlighting 'everything'
Add a call to action 'Follow for part 2' at the bottom at 3s
Make the lower third red
Change the lower third role to 'Founder' and put it on the left
Delete the lower third          Fade out the hook
```

Add-ons are smart groups: the agent only picks the add-on and its settings, and
the editor builds and lays it out (16:9 and 9:16). The first quote is the main
text and the second the secondary text (subtitle, role); a quote after a
setting's name ("subtitle 'Setup'", "highlighting 'everything'") goes to that
setting. Naming a placed block ("the lower third", "the hook") and asking for a
new setting rebuilds it in place; "move", "delete" or "fade" act on all of its
parts.

**Slash commands**

Type `/` for the add-on list and `@` for media; ↑/↓ move, Enter or Tab picks,
Esc closes. A slash command names an add-on exactly (a unique start such as
`/neural`, or a one-letter slip such as `/neurall`, also works):

```text
Add /neural-network in scene 4 with 4 seconds delay
Add /flowchart with steps load -> train -> ship after 2s
Add /lower-third 'Adya' 'ML engineer'
Add a step 'Test' to /flowchart        (to / in / of: the one on the scene)
Make /flowchart vertical               Delete /flowchart
```

Commands: /title-card, /lower-third, /hook, /neural-network, /flowchart,
/equation, /code-walkthrough. "with N seconds delay", "after Ns" and "at Ns"
set when the add-on starts.

**Technical add-ons**

```text
Add a neural network with layers 3, 5, 5, 2 and a forward and backward pass
Add an MLP with 784 inputs, two hidden layers of 128 and 10 outputs
Add a 3-layer neural network on scene 3
Make the network seven layers with 12 neurons in the middle
Add a hidden layer to the network       Remove a layer from the network
Make the input layer of the network 10 neurons
Make the network vertical with sparse connections

Add a flowchart: collect data -> clean -> train -> deploy
Add a pipeline 'Ingest' 'Embed' 'Index' 'Query' step by step with a pulse
Add a step 'Test' after 'Train model' in the flowchart
Remove the step 'Clean' from the flowchart     Rename 'Clean' to 'Preprocess'
Connect 'Deploy' back to 'Collect data' in the flowchart labelled 'retrain'
Make the flowchart vertical with pill steps

Add an equation reveal 'x^2 - 4 = 0' 'x^2 = 4' 'x = \pm 2' one at a time
Add a step by step derivation titled 'Solving' with 'a+b=c' 'a=c-b'

Add a code walkthrough of '…code…' with lines 1-3 'Load' and lines 4-7 'Train'
```

"The network", "the flowchart" (or "the pipeline"), "the equation" and "the
walkthrough" point at the block on the scene, so "add a step to the
flowchart" changes it while "add a flowchart" (or "another flowchart") adds
one. Networks: an architecture ("3-5-5-2", "[784, 128, 10]"), inputs/hidden/
outputs, a total layer count (with an optional size in the middle), adding or
removing a layer, or one layer's size. Large layers are drawn with "⋮" and
their size in the label. Flowcharts: a step ending in "?" is a decision;
loops back arc around the flow.

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
Remove the retakes           Cut out the false starts in scene 2
Add jump cuts with punch-in zooms                                Zoom in 15% on every other cut
Cut to the beat              Cut to the beat every 2 beats       Cut on every bar
Split the video into shots   Detect camera cuts in scene 2
```

- **Silences** are found by loudness and cut out of each scene's video clip,
  keeping a little breathing room next to speech.
- **Filler words** ("um", "uh", "er", "hmm") come from local Whisper with word
  timings. Those timings are approximate, so play the result back; when a filler
  runs straight into the next word it can be missed.
- **Retakes** are sentences started again ("So today we're— so today we're
  going to…"): the earlier tries are cut and the last take stays. They come
  from the same Whisper words, so play the result back.
- **Punch-in zooms** zoom every other part of a cut clip in a little (10%, or
  the percentage you give) so jump cuts look intentional. "Punch in on the
  cuts" alone zooms the parts already there.
- The **Jump cuts** section of the Video panel does the same with sliders, and
  shows every cut on the timeline before applying; **Edit by transcript** there
  cuts the video by deleting its words.
- **Cut to the beat** finds the tempo of the background music and moves scene
  ends to the nearest beat.
- **Shots** are found where the picture changes suddenly; each becomes its own
  scene.

**Green screen and background removal**

```text
Remove the green screen            Key out the blue screen on the video
Chroma key the image               Remove the background from my video
Blur my background                 Replace the background behind me with black
Bring the background back
```

A green or blue screen colour becomes transparent; "remove the background"
of a clip (or "cut me out") keeps the person with an on-device AI cut-out,
optionally blurring the room or filling it with a colour. Without a clip being
meant, "change the background to blue" still changes the scene's background.
A clip cut into parts (jump cuts, splits) changes in every part. Fine-tune
both in **Edit BG** (left menu) or the clip's **Remove background** section.

Run smart edits as their own request. They plan against the project as it is
when you press send.

## Safety And Limits

- Every plan is validated before Apply: scene numbers that don't exist, missing
  assets and unresolvable items are reported and removed, values are clamped.
- The agent only uses assets already in the project.
- A project always keeps at least one scene.
- **Preview** (between Apply and Cancel) tries the plan without keeping it and
  shows each changed scene before and after.
- Every applied plan is numbered: **#1**, **#2**, … `/history` lists this
  project's AI edits (prompt start, time, number); `/undo #2` undoes one (after
  "/undo " the list offers your edits; `/undo` alone = the last one). The
  **Undo** button, `undo #2` and `undo the last AI edit` work too.
  Only what that edit changed goes back — later edits and your own changes are
  kept (anything changed since is left as it is and listed). The undo is one
  normal undo step, so Ctrl+Z brings the edit back. Numbers last for the session.
- Ctrl+Z undoes the latest change, an applied plan included, in one step.
