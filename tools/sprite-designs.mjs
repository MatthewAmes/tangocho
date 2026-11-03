/* ── Kotoba Quest's creatures, drawn as 48×48 pixel art ──
   Every design is original (see src/data/quest-world.js for where each name comes from).
   Parts are listed back to front; tools/pixel-art.mjs shades and outlines them. Creatures
   face right — the game mirrors your own lead so the two face each other in battle. */
import { Sprite, ramp, E, C, P, R, K, path } from "./pixel-art.mjs";

const INK = "#1c1430";
const BLUSH = "#ff9fb8";
const WHITE = ramp(["#5d6a9a", "#9eabd3", "#d6def2", "#eef3ff", "#ffffff"]);
const CREAM = ramp(["#9a6a4a", "#d9a878", "#f6d6a6", "#ffecc8", "#fff8e8"]);

export const DESIGNS = {
  kotodama(s) {
    const VIOLET = ramp("#9a6ff0", { spread: 0.11 });
    s.part(VIOLET, {}, C(24, 31, 12), path([[18, 24], [13, 18], [12, 12], [15, 7]], 6.5, 1.2));
    s.part(ramp("#d2b8ff"), { decal: true }, E(19, 26, 5, 4, -0.5));
    s.eye(23, 26, { w: 4, h: 5, iris: "#b493ff" }).eye(31, 26, { w: 4, h: 5, iris: "#b493ff" });
    s.pxs([[27, 33], [28, 34], [29, 33]], INK);
    s.pxs([[21, 32], [22, 32], [35, 32], [36, 32]], BLUSH);
    s.sparkle(39, 14, "#ffe27a", 2).sparkle(8, 35, "#ffffff", 1).sparkle(40, 38, "#c7a6ff", 1).sparkle(32, 9, "#ffffff", 1);
  },

  samuneko(s) {
    const ICE = ramp("#6cc8ff"), SCARF = ramp("#3b7be0");
    s.part(WHITE, {}, path([[14, 40], [8, 36], [7, 29], [10, 25]], 2.4, 2));
    s.part(WHITE, {}, E(21, 36, 11, 8.5));
    s.part(WHITE, {}, P([[19, 17], [19, 5], [27, 12]]), P([[30, 12], [38, 5], [38, 17]]));
    s.part(ICE, { decal: true }, P([[18, 10], [18, 4], [23, 8]]), P([[34, 8], [39, 4], [39, 10]]));
    s.part(WHITE, {}, E(28, 22, 11, 10));
    s.part(WHITE, {}, E(25, 43, 3, 2.2), E(31, 43, 3, 2.2));
    s.part(SCARF, {}, E(27, 31.5, 10, 3.2));
    s.part(SCARF, {}, K(20, 32, 16, 41, 2.6, 2.2));
    s.pxs([[18, 31], [22, 31], [26, 31], [30, 31], [34, 31], [18, 36], [17, 38]], "#9cc4ff");
    s.eye(26, 18, { w: 4, h: 5, iris: "#4aa3ff" }).eye(33, 18, { w: 4, h: 5, iris: "#4aa3ff" });
    s.px(32, 24, "#ff7fa6");
    s.pxs([[30, 25], [31, 26], [32, 25], [33, 26], [34, 25]], "#6a5a8a");
    s.pxs([[25, 25], [37, 25]], BLUSH);
    s.sparkle(28, 14, "#58b8ff", 1).pxs([[27, 13], [29, 13], [27, 15], [29, 15]], "#a8dcff");
    s.pxs([[4, 18], [3, 19], [4, 20], [42, 33], [43, 34], [42, 35]], "#9cc4ff");
  },

  atsuinu(s) {
    const ORANGE = ramp("#f08a2c"), EAR = ramp("#b4562a"), FLAME = ramp("#ff5a2a"), FAN = ramp("#4aa8e8");
    s.part(ORANGE, {}, path([[12, 36], [8, 31], [8, 25]], 2.6, 1.6));
    s.part(ORANGE, {}, E(21, 35, 12, 9));
    s.part(CREAM, { decal: true }, E(25, 38, 7, 5));
    s.part(ORANGE, {}, E(12, 42, 4, 3));
    s.part(EAR, {}, E(37, 17, 3, 5, 0.4));
    s.part(FLAME, {}, K(30, 14, 30, 7, 4.4, 2), K(30, 7, 27, 2, 2, 0.4), K(34, 12, 36.5, 8, 1.7, 0.4));
    s.part(ramp("#ffd23a"), { decal: true }, K(30, 15, 30, 9, 2.4, 0.8));
    s.part(ORANGE, {}, E(29, 23, 10, 9.5), E(35, 27, 6, 4.2));
    s.part(CREAM, { decal: true }, E(36, 28, 5, 3.4));
    s.part(EAR, {}, E(21, 22, 3.5, 6.5, -0.35));
    s.part(ramp("#ff6f8e"), { round: 1.5 }, K(36, 31, 36.5, 35, 1.8));
    s.part(ORANGE, {}, E(26, 43, 3, 2.5));
        s.part(FAN, {}, P([[38, 41], [37, 31], [39, 26], [43, 24.5], [45.5, 27], [46, 32]]));
    s.line(38, 40, 39, 28, "#1f5a98").line(38, 40, 42, 26, "#1f5a98").line(38, 40, 44, 28, "#1f5a98").line(38, 40, 45, 32, "#1f5a98");
    s.part(ORANGE, {}, E(33, 42, 3, 2.5));
    s.part(ramp("#8fd8ff"), { round: 2 }, C(19, 13, 2), P([[17.2, 12.5], [19, 8.5], [20.8, 12.5]]));
    s.rect(39, 25, 2, 2, "#3a1f1a").px(39, 25, "#8a6a5a");
    s.line(34, 30, 38, 30, "#7a3a2a");
    s.line(36, 32, 36, 34, "#d04a6a");
    s.eye(27, 18, { w: 3, h: 4, iris: "#9a5a2a" }).eye(33, 18, { w: 3, h: 4, iris: "#9a5a2a" });
    s.pxs([[26, 25], [31, 25]], "#ff7a6a");
  },

  haredori(s) {
    const YELLOW = ramp("#ffcf3a", { spread: 0.09 }), RAY = ramp("#ff8a1f"), BEAK = ramp("#ff9a2a");
    s.part(RAY, {}, P([[13, 30], [4, 25], [7, 31], [3, 36], [13, 36]]));
    s.part(RAY, {}, K(22, 20, 17, 11, 2.4, 1), K(26, 19, 26, 8, 2.6, 1), K(30, 20, 34, 11, 2.4, 1));
    s.part(YELLOW, {}, C(24, 30, 12));
    s.part(CREAM, { decal: true }, E(28, 35, 7, 6));
    s.part(ramp("#f5b02a"), {}, E(16, 28, 5, 8.5, 0.75));
    s.line(12, 31, 15, 28, "#c98a1a").line(13, 34, 17, 31, "#c98a1a");
    s.part(BEAK, { round: 2 }, P([[35, 26], [42, 28.5], [35, 31]]));
    s.line(36, 28, 40, 28, "#c05a10");
    s.eye(29, 22, { w: 4, h: 5, iris: "#8a5a1a" });
    s.pxs([[32, 31], [33, 31]], BLUSH);
    s.line(21, 42, 21, 45, "#e07a10").line(27, 42, 27, 45, "#e07a10").pxs([[20, 45], [22, 45], [26, 45], [28, 45]], "#e07a10");
    s.sparkle(40, 10, "#fff2a0", 1).sparkle(9, 9, "#fff2a0", 1);
  },

  reibouzu(s) {
    const BODY = ramp(["#6a7a9a", "#a8b4cc", "#dce4f0", "#f0f4fa", "#ffffff"]), ICE = ramp("#58c8f0");
    s.part(BODY, { round: 6 }, P([[10, 12], [13, 8], [34, 8], [37, 12], [37, 34], [39, 42], [33, 38], [28, 44], [23, 38], [18, 44], [13, 38], [8, 42], [10, 34]]));
    s.part(ramp("#5f6c84"), { flat: true, tone: 2 }, R(14, 28, 20, 1), R(14, 31, 20, 1), R(14, 34, 20, 1));
    s.part(ICE, { round: 2 }, E(24, 7, 11, 2.2));
    s.part(ICE, { round: 1 }, C(5, 18, 2), C(43, 15, 2), C(44, 27, 1.6));
    s.eye(16, 15, { w: 4, h: 5, iris: "#58c8f0" }).eye(28, 15, { w: 4, h: 5, iris: "#58c8f0" });
    s.line(15, 13, 20, 14, INK).line(32, 13, 27, 14, INK);
    s.pxs([[21, 23], [22, 24], [23, 23], [24, 24], [25, 23], [26, 24]], INK);
    s.pxs([[39, 20], [40, 21], [41, 20], [6, 25], [7, 26], [8, 25]], "#a8e0ff");
  },

  mezamashi(s) {
    const RED = ramp("#e0463a"), GOLD = ramp("#f2c14a"), STEEL = ramp("#9aa6b8"), COMB = ramp("#ff3b4b");
    s.part(ramp("#2f8a5a"), {}, K(14, 28, 5, 13, 3, 1.4), K(13, 31, 3, 22, 3, 1.4), K(13, 34, 3, 31, 2.6, 1.2));
    s.part(STEEL, {}, K(16, 38, 13, 45, 1.4), K(27, 38, 30, 45, 1.4));
    s.part(GOLD, { shine: 1 }, C(12, 19, 5), C(23, 15, 5));
    s.part(STEEL, {}, K(17, 14, 17, 20, 0.9), C(17, 13, 1.5));
    s.part(RED, {}, C(21, 31, 12));
    s.part(ramp("#fff4dc"), { decal: true }, C(22, 32, 8.5));
    s.pxs([[22, 25], [22, 39], [15, 32], [29, 32], [17, 27], [27, 27], [17, 37], [27, 37]], "#7a5a4a");
    s.line(22, 32, 22, 27, INK).line(22, 32, 26, 34, INK).px(22, 32, "#e0463a");
    s.part(COMB, {}, C(32, 13, 2), C(35.5, 11.5, 2.3), C(39, 13, 2));
    s.part(RED, {}, K(29, 27, 34, 21, 4.5, 4), C(35, 19, 5.5));
    s.part(GOLD, { round: 2 }, P([[39, 16], [46, 17.5], [40, 19.5]]));
    s.part(ramp("#d89a2a"), { round: 2 }, P([[39, 21], [45, 22.5], [39, 23.5]]));
    s.px(40, 20, "#7a1a2a");
    s.part(COMB, {}, C(38, 25, 1.8));
    s.eye(34, 16, { w: 3, h: 4, iris: "#7a2a1a" });
    s.line(33, 14, 37, 15, INK);
    s.pxs([[45, 13], [46, 11], [45, 26], [46, 28]], "#ffd84a");
  },

  nebokuro(s) {
    const OWL = ramp("#7f8fb8"), CAP = ramp("#5a6ad8"), PILLOW = ramp(["#8a7aa8", "#c8bce0", "#eee8fa", "#f8f5ff", "#ffffff"]);
    s.part(OWL, {}, E(23, 29, 12, 13));
    s.part(ramp("#d8def0"), { decal: true }, E(25, 25, 9.5, 6.5));
    s.part(CAP, {}, path([[18, 14], [26, 8], [35, 9], [41, 16]], 5, 1.6));
    s.part(WHITE, { decal: true }, K(28, 4, 29, 12, 1.1), K(35, 6, 35, 13, 1.1));
    s.part(WHITE, {}, K(13, 17, 32, 13, 2.2));
    s.part(WHITE, {}, C(42, 19, 2.6));
    s.pxs([[19, 25], [20, 26], [21, 26], [22, 25], [27, 25], [28, 26], [29, 26], [30, 25]], INK);
    s.part(ramp("#f2b84a"), { round: 1.5 }, P([[23.5, 27], [26.5, 27], [25, 30.5]]));
    s.part(ramp("#a8e0ff"), { round: 2.5, outline: 0.7 }, C(31, 30, 2.8));
    s.px(30, 29, "#ffffff");
    s.part(PILLOW, {}, E(24, 40, 13.5, 5.5), C(11, 36, 1.6), C(37, 36, 1.6));
    s.part(OWL, {}, E(12, 38, 3.5, 5, 0.4), E(36, 38, 3.5, 5, -0.4));
    s.pxs([[41, 24], [42, 24], [43, 24], [42, 25], [41, 26], [42, 26], [43, 26]], "#8a9ad8");
    s.pxs([[44, 20], [45, 20], [45, 21], [44, 22], [45, 22]], "#b8c4f0");
  },

  keekin(s) {
    const FROST = ramp(["#b88a8a", "#e8c8c8", "#fff1ee", "#fffaf8", "#ffffff"]), PINK = ramp("#ffb0c0");
    s.part(FROST, {}, C(15, 20, 3.2), C(29, 18, 3.2));
    s.part(PINK, { decal: true }, C(15, 20, 1.6), C(29, 18, 1.6));
    s.part(FROST, {}, E(24, 33, 14, 11));
    s.part(ramp("#e04a6a"), { decal: true }, E(24, 45, 20, 13));
    s.part(ramp("#f4c86a"), { decal: true }, E(24, 47, 20, 13));
    s.part(FROST, { decal: true }, C(14, 34, 1.6), C(22, 34.5, 1.4), C(31, 35, 1.6));
    s.part(PINK, {}, E(17, 44, 3, 1.8), E(29, 44, 3, 1.8));
    s.part(ramp("#8ad0ff"), {}, R(25, 12, 2, 10));
    s.pxs([[25, 14], [26, 15], [25, 18], [26, 19]], "#ffffff");
    s.part(ramp("#ffb83a"), { round: 1.5 }, C(26, 10, 1.6), P([[24.5, 10], [26, 5.5], [27.5, 10]]));
    s.part(ramp("#e8344a"), { shine: 1 }, C(18, 19, 3.4), P([[14.8, 19.5], [18, 26], [21.2, 19.5]]));
    s.part(ramp("#4ab84a"), {}, P([[14.5, 17], [18, 14.5], [21.5, 17], [18, 18]]));
    s.pxs([[17, 21], [19, 20], [18, 23], [16, 19]], "#ffe27a");
    s.eye(27, 25, { w: 3, h: 4 }).eye(33, 25, { w: 3, h: 4 });
    s.px(32, 30, "#ff7fa6").pxs([[31, 31], [33, 31]], "#8a5a5a");
    s.part(FROST, {}, E(27, 38, 2.2, 2), E(36, 37, 2.2, 2));
    s.sparkle(24, 30, "#ffc21a", 1).sparkle(40, 30, "#ffc21a", 1);
  },

  sentakuma(s) {
    const BROWN = ramp("#9a6a42"), TAN = ramp("#e8c49a"), FOAM = ramp(["#7a8ab8", "#b8c8ea", "#e8f0ff", "#f8fbff", "#ffffff"]);
    s.part(ramp("#ff8ab0"), {}, C(8, 16, 3.2));
    s.part(ramp("#7ac0ff"), {}, C(14, 15, 3.2));
    s.part(ramp("#d0a050"), {}, P([[3, 17], [19, 16], [18, 32], [6, 33]]));
    s.line(5, 21, 18, 20, "#9a6a2a").line(5, 25, 18, 24, "#9a6a2a").line(6, 29, 18, 28, "#9a6a2a");
    s.part(BROWN, {}, E(24, 35, 12, 9.5));
    s.part(TAN, { decal: true }, E(26, 38, 6.5, 5));
    s.part(BROWN, {}, C(20, 12, 3.6), C(35, 12, 3.6));
    s.part(TAN, { decal: true }, C(20, 12, 1.8), C(35, 12, 1.8));
    s.part(BROWN, {}, E(28, 21, 10, 9));
    s.part(TAN, { round: 2 }, E(34, 25, 5, 3.6));
    s.part(ramp("#f06a4a"), {}, K(36.5, 7, 35.5, 13, 1.1));
    s.part(BROWN, {}, E(20, 44, 3.6, 2.2), E(31, 44, 3.6, 2.2));
    s.part(BROWN, {}, E(34, 34, 3, 4));
    s.part(FOAM, {}, C(22, 13, 3), C(26.5, 11.5, 3.6), C(31, 13, 2.6), C(14, 36, 3), C(17, 40, 2.4), C(37, 37, 2.6));
    s.rect(37, 23, 2, 2, INK).px(37, 23, "#7a6a7a");
    s.pxs([[34, 28], [35, 28]], "#6a3a2a");
    s.eye(27, 18, { w: 3, h: 4, iris: "#8a5a3a" }).eye(32, 18, { w: 2, h: 4, iris: "#8a5a3a" });
    s.pxs([[25, 24], [36, 24]], BLUSH);
    for (const [x, y] of [[42, 14], [8, 41], [43, 28]]) s.pxs([[x - 1, y - 2], [x, y - 2], [x + 1, y - 1], [x + 1, y], [x, y + 1], [x - 1, y + 1], [x - 2, y], [x - 2, y - 1]], "#9cc4ff").px(x - 1, y - 1, "#ffffff");
  },

  gomitanu(s) {
    const TAN = ramp("#8a6a4a"), MASK = ramp("#3d2f2a"), LIGHT = ramp("#e8d4b4"), LID = ramp("#a8b4c4");
    s.part(TAN, {}, path([[14, 38], [8, 37], [5, 31]], 3.2, 2.8));
    s.part(MASK, { decal: true }, K(6, 35, 10, 35, 0.9), C(5, 30, 2.8));
    s.part(TAN, {}, E(22, 35, 11, 9.5));
    s.part(LIGHT, { decal: true }, E(25, 38, 6, 5));
    s.part(MASK, {}, C(20, 14, 2.8), C(33, 13, 2.8));
    s.part(TAN, {}, E(27, 22, 10, 9));
    s.part(MASK, { decal: true }, E(25, 22, 4, 3), E(32, 22, 4, 3));
    s.part(LIGHT, { decal: true }, E(33, 26.5, 4.5, 2.6));
    s.part(LID, { shine: 1 }, E(27, 11, 6, 3.2));
    s.part(LID, {}, E(27, 13.5, 9.5, 2.2));
    s.part(LID, {}, K(25, 8, 29, 8, 0.8));
    s.part(ramp("#5ab84a"), {}, P([[29, 6], [34, 2], [38, 3], [34, 7]]));
    s.line(30, 6, 36, 3, "#2f7a2a");
    s.part(MASK, {}, E(19, 44, 3, 2), E(28, 44, 3, 2));
    s.part(ramp("#5fc070"), {}, E(40, 38, 6, 6.5), K(40, 32, 37.5, 28, 1, 0.7), K(40, 32, 42.5, 28, 1, 0.7));
    s.part(ramp("#f2c84a"), { round: 1 }, C(40, 31.5, 1.5));
    s.pxs([[38, 36], [38, 37], [39, 38], [41, 35], [42, 36], [42, 40], [38, 41]], "#c8f4d0");
    s.part(TAN, {}, E(35, 34, 2.6, 2.6));
    s.rect(36, 24, 2, 2, INK);
    s.eye(23, 20, { w: 3, h: 4, dark: "#0d0a12", iris: "#c88a3a" }).eye(31, 20, { w: 3, h: 4, dark: "#0d0a12", iris: "#c88a3a" });
    s.pxs([[33, 28], [34, 29], [35, 28]], "#5a3a2a");
  },

  houkitsune(s) {
    const FOX = ramp("#e8742a"), DARK = ramp("#3a2a3a"), STRAW = ramp("#e8c45a"), SCARF = ramp("#4a7ad8");
    s.part(FOX, {}, K(15, 36, 9, 34, 3.4, 3));
    s.part(STRAW, {}, P([[9, 30], [2, 38], [2, 45.5], [13, 45.5], [11, 37]]));
    s.line(4, 38, 4, 44, "#b08a2a").line(7, 36, 7, 44, "#b08a2a").line(10, 37, 10, 44, "#b08a2a");
    s.part(ramp("#d83a3a"), {}, K(8, 31.5, 11, 37, 1.3));
    s.part(FOX, {}, E(16, 42, 3.5, 3));
    s.part(FOX, {}, E(23, 35, 10, 8.5));
    s.part(WHITE, { decal: true, flat: true, tone: 3 }, E(30, 36, 4, 5.5));
    s.part(FOX, {}, K(27, 39, 27, 44, 1.6), K(32, 39, 32, 44, 1.6));
    s.part(DARK, { decal: true }, R(24, 43, 10, 3), R(13, 44, 6, 2));
    s.part(FOX, {}, P([[22, 16], [23, 3], [29, 12]]), P([[32, 12], [39, 4], [38, 17]]));
    s.part(DARK, { decal: true }, P([[23.5, 13], [24, 6], [27, 11]]), P([[34, 11], [38, 7], [37.5, 14]]));
    s.part(FOX, {}, E(30, 21, 8.5, 7.5), P([[35, 18], [44, 24], [35, 28]]));
    s.part(WHITE, { decal: true, flat: true, tone: 3 }, P([[27, 24], [44, 24.5], [36, 29], [27, 28]]));
    s.part(SCARF, {}, E(29, 13.5, 8.5, 3.2), C(20.5, 15, 2), K(20, 16, 16, 19, 1.3, 0.8));
    s.pxs([[26, 12], [30, 11], [33, 13], [28, 15], [35, 15], [23, 14]], "#ffffff");
    s.rect(43, 23, 2, 2, INK);
    s.eye(32, 18, { w: 3, h: 4, iris: "#a85a1a" });
    s.pxs([[37, 27], [38, 27], [39, 26]], "#9a4a2a");
    s.pxs([[1, 44], [14, 46], [15, 44]], "#c8c0b0");
  },

  tempuragon(s) {
    const BATTER = ramp("#e8b040", { spread: 0.1 }), SHRIMP = ramp("#ff7a4a"), WOOD = ramp("#c8955a");
    s.part(WOOD, {}, K(13, 30, 5, 12, 1.1), K(18, 26, 14, 7, 1.1));
    s.part(BATTER, {}, path([[12, 38], [6, 40], [4, 36]], 3, 1.6));
    s.part(BATTER, {}, C(23, 33, 11), C(14, 28, 3), C(19, 23, 3), C(26, 22, 3), C(32, 27, 3), C(12, 34, 3), C(14, 40, 3), C(31, 39, 3), C(22, 43, 2.5));
    s.part(ramp("#ffe29a"), { decal: true }, E(27, 36, 6, 5));
    s.part(ramp("#d89a30"), {}, K(19, 29, 13, 21, 3, 1.4));
    s.part(SHRIMP, {}, K(30, 17, 24, 8, 2.2, 3.2), K(33, 16, 33, 5, 2.2, 3.4));
    s.line(28, 13, 25, 11, "#c84a2a").line(31, 12, 34, 12, "#c84a2a").line(31, 9, 35, 9, "#c84a2a").line(26, 8, 23, 10, "#ffb08a");
    s.part(BATTER, {}, C(32, 22, 7.5), C(28, 16, 2.5), C(36, 16, 2.5), E(38.5, 25, 5, 3.6));
    s.part(BATTER, {}, E(18, 44, 3, 2), E(27, 44, 3, 2));
    s.pxs([[16, 31], [21, 27], [24, 38], [13, 36], [29, 30], [19, 40], [26, 18], [35, 21], [17, 25]], "#b8782a");
    s.pxs([[20, 33], [25, 30], [30, 25]], "#fff0b0");
    s.eye(32, 19, { w: 3, h: 4, iris: "#8a4a1a" });
    s.px(42, 24, "#7a4a1a").pxs([[37, 28], [38, 29], [39, 29], [40, 28]], "#7a4a1a");
    s.rect(44, 20, 2, 2, "#f4f4f8").rect(45, 16, 2, 2, "#e0e0ea").px(43, 13, "#c8c8d8");
  },

  yakyusagi(s) {
    const PINK = ramp("#ffb0c8"), RED = ramp("#e03a3a");
    s.part(WHITE, {}, E(14, 43, 5, 2.5));
    s.part(WHITE, {}, E(22, 34, 10, 10));
    s.part(ramp(["#9aa4c8", "#d8def0", "#fbfcff", "#ffffff", "#ffffff"]), { decal: true }, C(24, 36, 6));
    s.pxs([[20, 32], [21, 33], [21, 35], [21, 37], [20, 39], [28, 32], [27, 33], [27, 35], [27, 37], [28, 39]], "#e03a3a");
    s.part(WHITE, {}, C(28, 21, 9));
    s.part(RED, { shine: 1 }, E(28, 14.5, 8.8, 4.8));
    s.part(RED, { bias: -1 }, E(38, 17, 5.5, 1.5));
    s.part(WHITE, {}, K(24, 12, 21, 4, 2.6, 2.3), K(29, 12, 32, 4, 2.6, 2.3));
    s.part(PINK, { decal: true }, K(23.5, 10, 21.5, 5, 1.1), K(29.5, 10, 31.5, 5, 1.1));
    s.part(ramp("#d8a060"), {}, K(35, 41, 44, 27, 1.1, 2.1));
    s.part(WHITE, {}, C(35.5, 38.5, 2.6), E(27, 44, 4.2, 2.2));
    s.eye(27, 21, { w: 3, h: 4, iris: "#e05a7a" }).eye(33, 21, { w: 3, h: 4, iris: "#e05a7a" });
    s.px(36, 26, "#ff7fa6").pxs([[35, 27], [37, 27]], "#8a6a8a");
    s.pxs([[25, 25], [38, 24]], BLUSH);
  },

  kabukiji(s) {
    const GREEN = ramp("#2a9a7a"), MANE = ramp("#e8352a"), GOLD = ramp("#f2c14a"), TAIL = ramp("#c8a050");
    const FACE = ramp(["#b8b0c8", "#e0dce8", "#fbfaff", "#ffffff", "#ffffff"]);
    s.part(TAIL, {}, K(15, 32, 3, 13, 2.6, 0.9), K(15, 34, 2.5, 22, 2.6, 0.9), K(15, 36, 3, 31, 2.4, 0.9));
    s.pxs([[6, 18], [7, 19], [5, 25], [6, 26], [9, 22], [10, 23], [6, 31], [7, 32], [11, 28], [10, 33]], "#6a4a2a");
    s.part(GOLD, {}, K(22, 40, 21, 45, 1), K(28, 40, 33, 41, 1));
    s.part(GREEN, {}, E(23, 33, 9.5, 8));
    s.part(ramp("#1f6a5a"), { decal: true }, E(19, 33, 6, 4.5, -0.3));
    s.line(14, 35, 21, 32, "#f2c14a");
    s.part(ramp("#6a3a9a"), {}, K(27, 28, 30, 21, 4, 3.6));
    s.part(MANE, {}, K(27, 12, 18, 22, 6, 4), K(25, 15, 14, 33, 4.6, 1.2), K(27, 16, 20, 35, 4, 1), K(24, 13, 11, 22, 3.6, 1));
    s.line(22, 12, 14, 22, "#ff8a6a").line(20, 20, 16, 29, "#ff8a6a").line(24, 22, 22, 30, "#ff8a6a");
    s.part(FACE, {}, C(32, 17, 6.5));
    s.part(GOLD, { round: 1.5 }, P([[37.5, 16], [44, 18.5], [37.5, 21]]));
    s.line(38, 18, 42, 18, "#a87a1a");
    s.part(MANE, {}, path([[27, 12], [33, 9], [38, 12]], 3, 1.6));
    s.line(28, 19, 33, 23, "#e0322a").line(29, 20, 34, 23, "#e0322a").line(28, 15, 32, 13, "#e0322a").line(33, 13, 37, 14, "#e0322a");
    s.eye(32, 16, { w: 3, h: 3 });
    s.pxs([[20, 45], [23, 45], [34, 41], [34, 40]], "#c08a2a");
  },

  suutsuru(s) {
    const NAVY = ramp("#2a3a6a"), LEG = ramp("#3a3a4a");
    s.part(LEG, {}, K(20, 34, 19, 45, 1), K(25, 34, 27, 45, 1));
    s.pxs([[17, 45], [29, 45]], "#3a3a4a");
    s.part(ramp("#2a2a35"), {}, P([[13, 26], [5, 33], [9, 35], [15, 31]]));
    s.part(ramp("#8a5a2a"), {}, R(6, 34, 9, 7));
    s.part(ramp("#5a3a1a"), {}, K(9, 33, 12, 33, 0.7));
    s.px(10, 37, "#f2c14a");
    s.part(NAVY, {}, E(21, 28, 9, 8));
    s.part(WHITE, { decal: true }, P([[22, 20], [31, 20], [27, 30]]));
    s.part(ramp("#d83a3a"), { decal: true }, P([[25.5, 21], [27.5, 21], [28, 27], [26.5, 29], [25, 27]]));
    s.line(23, 21, 26, 28, "#1a2448").line(31, 21, 28, 28, "#1a2448");
    s.part(NAVY, {}, E(15, 30, 3.5, 6, 0.3));
    s.part(WHITE, {}, K(27, 22, 29, 11, 2.2, 2));
    s.part(WHITE, {}, E(30, 9, 4.6, 3.8));
    s.part(ramp("#e83a3a"), { decal: true }, C(29.5, 6.2, 1.8));
    s.part(ramp("#c8b07a"), { round: 1.5 }, P([[33, 8], [45, 10.5], [33, 11]]));
    s.rect(30, 8, 2, 2, INK).px(30, 8, "#ffffff");
    s.line(29, 7, 32, 7, "#2a2a35");
    s.pxs([[32, 23], [24, 24]], "#e8e8f0");
  },

  kaishachi(s) {
    const BLACK = ramp(["#0f1424", "#1f2840", "#2f3a58", "#46557a", "#6a7aa0"]);
    const BRIGHT = ramp(["#aab4d0", "#d8def0", "#f6f8ff", "#ffffff", "#ffffff"]);
    s.part(BLACK, {}, P([[13, 18], [8, 6], [18, 14]]));
    s.part(BLACK, {}, E(10, 32, 3, 5.5, 0.5));
    s.part(BLACK, {}, P([[12, 40], [3, 37], [6, 45], [14, 44]]));
    s.part(BLACK, {}, E(23, 29, 12.5, 15.5));
    s.part(BRIGHT, { decal: true, flat: true, tone: 2 }, E(30, 35, 7, 9.5));
    s.part(BRIGHT, { decal: true, flat: true, tone: 2 }, E(30, 17.5, 4.8, 3.2, -0.25));
    s.line(16, 22, 20, 31, "#e83a4a").line(25, 22, 21, 31, "#e83a4a");
    s.part(BRIGHT, { flat: true, tone: 2 }, R(17, 31, 8, 8));
    s.part(ramp("#3a7ae8"), { decal: true, flat: true }, R(17, 31, 8, 2));
    s.rect(18, 34, 2, 3, "#c8a080").line(21, 34, 23, 34, "#8a94b0").line(21, 36, 23, 36, "#8a94b0");
    s.part(BLACK, {}, E(36, 33, 3, 4.5, -0.8));
    s.part(BRIGHT, { round: 2 }, R(38, 25, 6, 7));
    s.part(BRIGHT, {}, K(44, 27, 45, 29, 1));
    s.part(ramp("#7a4a2a"), { decal: true, flat: true }, R(38, 25, 6, 1));
    s.eye(29, 16, { w: 3, h: 3, dark: "#0a0a12" });
    s.line(27, 25, 34, 24, "#0f1424");
    s.pxs([[39, 22], [40, 21], [40, 20], [42, 22], [43, 21], [43, 20]], "#d8dce8");
  },

  yubiwani(s) {
    const GREEN = ramp("#4ab05a"), BELLY = ramp("#e8e0a0"), GOLD = ramp("#f2c94a"), GEM = ramp("#7ae8ff");
    s.part(GREEN, {}, path([[16, 38], [10, 37], [7, 32], [8, 25]], 4.2, 2));
    s.part(GOLD, { shine: 1 }, E(7.5, 31, 4.6, 1.6));
    s.part(GEM, { shine: 2, round: 2 }, P([[3, 26], [12, 26], [13.5, 28], [7.5, 34], [1.5, 28]]));
    s.line(3, 28, 12, 28, "#3ab0d8").line(7, 26, 7, 33, "#c8f8ff");
    s.part(GREEN, {}, E(18, 42, 3, 3), E(33, 42, 3, 3));
    s.part(ramp("#3a8a4a"), {}, C(18, 27.5, 1.8), C(22, 26.5, 1.8), C(26, 26, 1.8));
    s.part(GREEN, {}, E(24, 35, 10, 7));
    s.part(BELLY, { decal: true }, E(26, 40, 8, 3.5));
    s.part(GREEN, {}, E(32, 28, 7, 6), E(39, 31, 7.5, 3.5));
    s.part(BELLY, { decal: true }, E(39, 34, 7, 1.6));
    s.part(ramp("#2a2a3a"), { shine: 1 }, E(29.5, 22.5, 2.6, 1.9), E(35.5, 22.5, 2.6, 1.9));
    s.line(32, 22, 33, 22, "#2a2a3a");
    s.line(33, 32, 45, 32, "#1f5a2a").px(46, 31, "#1f5a2a");
    s.pxs([[36, 33], [39, 33], [42, 33]], "#ffffff");
    s.eye(33, 25, { w: 3, h: 3, iris: "#c8a020" });
    s.line(32, 25, 36, 25, "#2f7a3a");
    s.px(44, 29, "#1f5a2a");
    s.sparkle(14, 23, "#ffffff", 1).sparkle(2, 21, "#c8f8ff", 1);
  },

  nattounagi(s) {
    const BEAN = ramp("#d8a55a"), BEAN2 = ramp("#ecc47c"), WOOD = ramp("#a86a3a");
    const spine = [[5, 41], [13, 43], [21, 40], [24, 34], [20, 27], [22, 21], [30, 19]];
    s.part(BEAN, {}, path(spine, 2.4, 5.4));
    for (const [x, y] of [[7, 41], [12, 43], [17, 42], [21, 38], [23, 34], [21, 29], [19, 25], [22, 21]]) s.part(BEAN2, { round: 1.5 }, C(x, y - 1, 2.2));
    s.part(BEAN, {}, E(35, 20, 8, 7));
    s.part(WOOD, {}, P([[28, 8], [42, 8], [39.5, 13.5], [30.5, 13.5]]));
    s.part(ramp("#5a3418"), { decal: true, flat: true, tone: 1 }, E(35, 8.5, 6.2, 1.5));
    s.pxs([[31, 12], [33, 12], [35, 12], [37, 12], [39, 12]], "#d8904a");
    s.line(9, 39, 7, 31, "#f4e4b0").line(26, 34, 32, 29, "#f4e4b0").line(17, 39, 16, 33, "#f4e4b0").line(41, 26, 45, 31, "#f4e4b0");
    s.pxs([[7, 30], [33, 28], [16, 32], [45, 32]], "#fffbe8");
    s.eye(32, 17, { w: 3, h: 4, iris: "#a86a2a" }).eye(38, 17, { w: 3, h: 4, iris: "#a86a2a" });
    s.pxs([[33, 23], [34, 24], [35, 24], [36, 24], [37, 24], [38, 24], [39, 23]], "#5a3418");
    s.pxs([[30, 22], [31, 22], [41, 22], [42, 22]], BLUSH);
  },

  purezentori(s) {
    const BOX = ramp("#ff7ab0"), RIB = ramp("#ffd23a"), ORANGE = ramp("#ff9a2a");
    s.line(19, 43, 19, 46, "#e07a10").line(28, 43, 28, 46, "#e07a10").pxs([[18, 46], [20, 46], [27, 46], [29, 46]], "#e07a10");
    s.part(BOX, {}, E(11, 31, 2.6, 4.2, 0.3));
    s.part(BOX, { round: 5 }, R(14, 20, 20, 24), R(12, 22, 24, 20), C(14, 22, 2), C(34, 22, 2), C(14, 42, 2), C(34, 42, 2));
    s.pxs([[16, 24], [30, 22], [17, 38], [31, 40], [15, 30], [33, 35], [28, 37]], "#ffd8ea");
    s.part(RIB, { decal: true }, R(19, 20, 4, 24), R(12, 31, 24, 3));
    s.part(RIB, { shine: 1 }, E(16, 16, 5, 3.4, 0.45), E(26, 16, 5, 3.4, -0.45));
    s.part(ramp("#f0a81a"), {}, C(21, 18, 2.2), K(20, 19, 17, 23, 1), K(22, 19, 24, 23, 1));
    s.part(ORANGE, { round: 2 }, P([[35, 26], [41, 28], [35, 30]]));
    s.eye(26, 23, { w: 3, h: 4 }).eye(31, 23, { w: 3, h: 4 });
    s.pxs([[25, 29], [33, 29]], "#ff4a8a");
    s.part(BOX, {}, E(37, 35, 2.6, 4.2, -0.3));
    s.line(38, 38, 40, 40, "#c8a080");
    s.part(ramp("#fff4dc"), { round: 1.5 }, R(39, 40, 6, 4));
    s.px(40, 41, "#c8a080");
  },

  isukappa(s) {
    const KAPPA = ramp("#5ab87a"), WOOD = ramp("#b07a3a"), HAIR = ramp("#2a6a4a");
    s.part(WOOD, {}, K(7, 35, 5, 45, 1.3), K(16, 34, 16, 44, 1.3));
    s.part(WOOD, {}, K(5, 15, 7, 35, 1.4), K(15, 13, 17, 33, 1.4), P([[3, 15], [17, 11], [18, 16], [4, 20]]), K(4, 36, 20, 35, 2));
    s.part(KAPPA, {}, E(24, 34, 9, 9));
    s.part(ramp("#e8e8a0"), { decal: true }, E(27, 36, 5, 6));
    s.part(KAPPA, {}, E(30, 42, 4.5, 2.6), E(22, 43, 4, 2.4));
    s.part(KAPPA, {}, E(32, 37, 2.6, 2.2));
    s.part(KAPPA, {}, C(28, 21, 8.5));
    s.part(HAIR, {}, P([[19, 19], [19, 13], [23, 14], [25, 10], [28, 13], [31, 10], [34, 13], [37, 12], [37.5, 18], [28, 16]]));
    s.part(ramp("#e8eef4"), {}, E(28, 12.5, 6, 2.2));
    s.part(ramp("#6ac8f8"), { decal: true, shine: 1 }, E(28, 12.5, 4.5, 1.3));
    s.part(ramp("#f2c84a"), { round: 2 }, E(36.5, 24.5, 4.2, 2.4));
    s.line(35, 25, 39, 25, "#c89a2a");
    s.eye(26, 18, { w: 3, h: 4 }).eye(32, 18, { w: 3, h: 4 });
    s.pxs([[25, 24], [26, 24]], BLUSH);
    s.pxs([[35, 45], [24, 46]], "#3a8a5a");
  },
};

export function draw(id) {
  const s = new Sprite(48, 48);
  DESIGNS[id](s);
  return s.render();
}
