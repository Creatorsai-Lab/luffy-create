var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/subtitlePresentation.test.ts
var import_strict = __toESM(require("node:assert/strict"));

// src/subtitle/presentation.ts
var clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
var easeOut = (value) => 1 - Math.pow(1 - clamp01(value), 3);
function compactLines(words, maxChars) {
  const text = words.join(" ");
  if (text.length <= maxChars || words.length < 2) return [text];
  let split = 1;
  let smallestDifference = Infinity;
  for (let index = 1; index < words.length; index++) {
    const difference = Math.abs(words.slice(0, index).join(" ").length - words.slice(index).join(" ").length);
    if (difference < smallestDifference) {
      split = index;
      smallestDifference = difference;
    }
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}
function layoutSubtitleLines(text, maxChars, look = "normal", intensity = 50) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  return compactLines(words, Math.max(1, maxChars)).map((line) => ({ text: line }));
}
function getSubtitleCurveOffset(look = "normal", intensity = 50, index, wordCount, fontSize) {
  const strength = clamp01(intensity / 100);
  if (look === "normal" || wordCount < 3 || strength === 0) return 0;
  const x = index / (wordCount - 1) * 2 - 1;
  const curve = (1 - x * x) * strength * fontSize * 0.28;
  return look === "curveOut" ? -curve : curve;
}
function getCaptionOrigin(frameWidth, frameHeight, captionWidth, captionHeight, positionX, positionY) {
  const x = frameWidth * clamp01(positionX / 100) - captionWidth / 2;
  const y = frameHeight * clamp01(positionY / 100) - captionHeight / 2;
  return {
    x: Math.min(Math.max(0, frameWidth - captionWidth), Math.max(0, x)),
    y: Math.min(Math.max(0, frameHeight - captionHeight), Math.max(0, y))
  };
}
function getSubtitleBlockState(animation = "wordPop", progress) {
  const p = clamp01(progress);
  const eased = easeOut(p);
  if (animation === "smoothReveal" || animation === "slideUp") {
    return { opacity: eased, scale: 0.94 + eased * 0.06, offsetY: (1 - eased) * 24 };
  }
  if (animation === "fade") return { opacity: eased, scale: 1, offsetY: 0 };
  if (animation === "pop") return { opacity: 1, scale: 0.82 + eased * 0.18, offsetY: 0 };
  return { opacity: 1, scale: 1, offsetY: 0 };
}
function getSubtitleWordState(animation = "wordPop", progress, index, wordCount) {
  const stable = { opacity: 1, scale: 1, offsetY: 0, emphasis: 0 };
  if (animation !== "wordPop" && animation !== "wordRise" && animation !== "karaokePulse") return stable;
  const p = clamp01(progress);
  if (animation === "karaokePulse") {
    if (p >= 1) return stable;
    const position = p * Math.max(1, wordCount);
    const active = Math.min(wordCount - 1, Math.floor(position));
    if (index < active) return stable;
    if (index > active) return { ...stable, opacity: 0.35 };
    return { ...stable, scale: 1 + Math.sin((position - active) * Math.PI) * 0.14, emphasis: 1 };
  }
  const local = clamp01(p * (Math.max(1, wordCount) + 0.5) - index);
  if (animation === "wordRise") {
    const eased = easeOut(local);
    return { opacity: eased, scale: 1, offsetY: (1 - eased) * 22, emphasis: 0 };
  }
  const scale = local < 0.7 ? 0.72 + easeOut(local / 0.7) * 0.4 : 1.12 - easeOut((local - 0.7) / 0.3) * 0.12;
  return { opacity: easeOut(local), scale, offsetY: (1 - easeOut(local)) * 10, emphasis: local > 0 && local < 1 ? 1 : 0 };
}

// scripts/subtitlePresentation.test.ts
var caption = "Any Content with this Font Style is getting Viral";
var normal = layoutSubtitleLines(caption, 18, "normal", 50);
import_strict.default.ok(normal.length <= 2);
var curveOut = layoutSubtitleLines(caption, 80, "curveOut", 100);
import_strict.default.equal(curveOut.length, 1);
import_strict.default.equal(curveOut[0].text, caption);
import_strict.default.ok(layoutSubtitleLines(`${caption} ${caption}`, 18, "curveIn", 100).length <= 2);
import_strict.default.ok(getSubtitleCurveOffset("curveOut", 100, 1, 3, 50) < getSubtitleCurveOffset("curveOut", 100, 0, 3, 50));
import_strict.default.ok(getSubtitleCurveOffset("curveIn", 100, 1, 3, 50) > getSubtitleCurveOffset("curveIn", 100, 0, 3, 50));
import_strict.default.equal(getSubtitleCurveOffset("curveOut", 0, 1, 3, 50), 0);
import_strict.default.deepEqual(getCaptionOrigin(1e3, 500, 400, 100, 50, 50), { x: 300, y: 200 });
import_strict.default.deepEqual(getCaptionOrigin(1e3, 500, 400, 100, 0, 0), { x: 0, y: 0 });
import_strict.default.deepEqual(getCaptionOrigin(1e3, 500, 400, 100, 100, 100), { x: 600, y: 400 });
import_strict.default.deepEqual(getCaptionOrigin(100, 50, 120, 80, 50, 50), { x: 0, y: 0 });
import_strict.default.deepEqual(getSubtitleBlockState("smoothReveal", 0), { opacity: 0, scale: 0.94, offsetY: 24 });
import_strict.default.deepEqual(getSubtitleBlockState("smoothReveal", 1), { opacity: 1, scale: 1, offsetY: 0 });
import_strict.default.deepEqual(getSubtitleBlockState("wordPop", 0), { opacity: 1, scale: 1, offsetY: 0 });
var rising = getSubtitleWordState("wordRise", 0, 0, 3);
import_strict.default.equal(rising.opacity, 0);
import_strict.default.equal(rising.offsetY, 22);
import_strict.default.deepEqual(getSubtitleWordState("wordRise", 1, 2, 3), {
  opacity: 1,
  scale: 1,
  offsetY: 0,
  emphasis: 0
});
var karaokeActive = getSubtitleWordState("karaokePulse", 0.45, 1, 3);
var karaokeFuture = getSubtitleWordState("karaokePulse", 0.45, 2, 3);
import_strict.default.equal(karaokeActive.opacity, 1);
import_strict.default.ok(karaokeActive.scale > 1);
import_strict.default.equal(karaokeFuture.opacity, 0.35);
console.log("subtitle presentation tests passed");
