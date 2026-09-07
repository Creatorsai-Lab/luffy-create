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

// scripts/subtitleStyle.test.ts
var import_strict = __toESM(require("node:assert/strict"));

// src/subtitle/types.ts
function defaultSubtitleStyle() {
  return {
    fontFamily: "Inter",
    fontSize: 54,
    fontWeight: "semibold",
    italic: false,
    fillMode: "solid",
    color: "#ffffff",
    gradientColor1: "#ffffff",
    gradientColor2: "#8b5cf6",
    gradientColor3: "#22d3ee",
    gradientOpacity1: 1,
    gradientOpacity2: 1,
    gradientOpacity3: 1,
    gradientUseColor3: false,
    maxWidthPct: 90,
    positionX: 50,
    positionY: 88,
    animation: "wordPop",
    captionLook: "normal",
    curveIntensity: 50
  };
}
function normalizeSubtitleStyle(style) {
  const normalized2 = { ...defaultSubtitleStyle(), ...style ?? {} };
  const animation = normalized2.animation === "pop" ? "wordPop" : normalized2.animation === "fade" || normalized2.animation === "slideUp" ? "smoothReveal" : normalized2.animation;
  return {
    ...normalized2,
    animation,
    maxWidthPct: Math.min(100, Math.max(20, normalized2.maxWidthPct)),
    positionX: Math.min(100, Math.max(0, normalized2.positionX)),
    positionY: Math.min(100, Math.max(0, normalized2.positionY)),
    curveIntensity: Math.min(100, Math.max(0, normalized2.curveIntensity ?? 50))
  };
}

// scripts/subtitleStyle.test.ts
var defaults = defaultSubtitleStyle();
import_strict.default.equal(defaults.fontFamily, "Inter");
import_strict.default.equal(defaults.fillMode, "solid");
import_strict.default.equal(defaults.maxWidthPct, 90);
import_strict.default.equal(defaults.positionX, 50);
import_strict.default.equal(defaults.positionY, 88);
import_strict.default.equal("backgroundEnabled" in defaults, false);
import_strict.default.equal("position" in defaults, false);
import_strict.default.equal("align" in defaults, false);
import_strict.default.equal(defaults.animation, "wordPop");
import_strict.default.equal(defaults.captionLook, "normal");
import_strict.default.equal(defaults.curveIntensity, 50);
var normalized = normalizeSubtitleStyle({
  fontFamily: "Poppins",
  color: "#f8fafc",
  positionX: 140,
  positionY: -20
});
import_strict.default.equal(normalized.fontFamily, "Poppins");
import_strict.default.equal(normalized.color, "#f8fafc");
import_strict.default.equal(normalized.gradientColor2, "#8b5cf6");
import_strict.default.equal(normalized.positionX, 100);
import_strict.default.equal(normalized.positionY, 0);
import_strict.default.equal(normalized.animation, "wordPop");
import_strict.default.equal(normalizeSubtitleStyle({ animation: "fade" }).animation, "smoothReveal");
import_strict.default.equal(normalizeSubtitleStyle({ animation: "slideUp" }).animation, "smoothReveal");
import_strict.default.equal(normalizeSubtitleStyle({ animation: "pop" }).animation, "wordPop");
console.log("subtitle style tests passed");
