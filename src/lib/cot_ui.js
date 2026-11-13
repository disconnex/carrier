//
//  CoT UI for ViSiON/3 scripts: the look and key handling shared by the
//  City of Thieves mods, ported from the ENiGMA mod data/mods/cot_ui. Pulled
//  into a script with a "//@include lib/cot_ui.js" line (vision3/install.py
//  expands it), so everything here is a global.
//
//  Output is raw ANSI for v3.console.write: ViSiON/3 sends the Unicode box
//  and block characters in the caller's encoding (CP437 or UTF-8).
//

//  ANSI.SYS-style cursor and screen codes (core/ansi_term.js on ENiGMA)
var ANSI = {
    goto: function (row, col) { return '\x1b[' + row + ';' + (col || 1) + 'H'; },
    clearScreen: function () { return '\x1b[2J'; },
    hideCursor: function () { return '\x1b[?25l'; },
    showCursor: function () { return '\x1b[?25h'; },
    //  0: to the end of the line, 2: the whole line
    eraseLine: function (n) { return '\x1b[' + (n || 0) + 'K'; },
};

//  Palette: old-school "elite" fade. Bright white -> gray -> purple -> dark
//  gray, with a purple lightbar and bright magenta as the accent.
var WHITE = '\x1b[0;1;37;40m';
var GRAY = '\x1b[0;37;40m';
var PURPLE = '\x1b[0;35;40m';
var DKGRAY = '\x1b[0;1;30;40m';
var PINK = '\x1b[0;1;35;40m';

var C = {
    num: DKGRAY,
    name: WHITE,
    size: PINK,
    sizeUnit: DKGRAY,
    desc: GRAY,
    tagged: PINK,
    count: PINK,
    bar: '\x1b[0;1;37;45m',
    cmdSel: '\x1b[0;1;37;45m',
    status: WHITE,
    pageInfo: DKGRAY,
    pageNum: GRAY,
    reset: GRAY,
};

//  "Filename" -> F(white) i(gray) l(purple) ename(dark gray), per word
var FADE = [WHITE, GRAY, PURPLE];
function fade(text) {
    var out = '';
    var pos = 0; //  position within the current word
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (/\s/.test(ch)) {
            pos = 0;
            out += ch;
            continue;
        }
        out += (FADE[pos] || DKGRAY) + ch;
        pos += 1;
    }
    return out + C.reset;
}

//  Command labels: bright first letter (the hotkey), the rest gray. The fade
//  is for headings only.
function hotkey(label) {
    return WHITE + label.slice(0, 1) + GRAY + label.slice(1) + C.reset;
}

function repeat(s, n) {
    return n > 0 ? new Array(n + 1).join(s) : '';
}

//  A rule that fades the same way left to right, then runs dark gray. The
//  fade spans about a quarter of the line (4 white, 6 gray, 12 purple at 80).
function rule(width, ch) {
    ch = ch || '─';
    var steps = [
        [WHITE, Math.max(2, Math.round(width * 0.05))],
        [GRAY, Math.max(3, Math.round(width * 0.075))],
        [PURPLE, Math.max(6, Math.round(width * 0.15))],
    ];
    var out = '';
    var used = 0;
    for (var i = 0; i < steps.length; i++) {
        var take = Math.min(steps[i][1], width - used);
        out += steps[i][0] + repeat(ch, take);
        used += take;
    }
    return out + DKGRAY + repeat(ch, Math.max(0, width - used)) + C.reset;
}

//  v3.console.readkey() names -> the key names the ENiGMA mods were written
//  against ("up", "page down", "return" ...), so the ported key handlers
//  read the same. Characters come back as ''.
var KEY_NAMES = {
    UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
    PGUP: 'page up', PGDN: 'page down', HOME: 'home', END: 'end',
    INS: 'insert', DEL: 'delete', ESC: 'escape', BACKTAB: 'backtab',
    '\r': 'return', '\n': 'return', '\x08': 'backspace', '\x7f': 'backspace',
};

function keyName(k) {
    return KEY_NAMES[k] || '';
}

//  The typed character for a readkey() result, or '' for a named key
function keyChar(k) {
    return k && k.length === 1 && !KEY_NAMES[k] ? k : '';
}

function formatSize(bytes) {
    if (typeof bytes !== 'number' || bytes < 0) {
        return '';
    }
    if (bytes < 1000) {
        return String(bytes);
    }
    if (bytes < 1000 * 1024) {
        return Math.round(bytes / 1024) + 'K';
    }
    return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + 'M';
}

//  Size in two tones, right-aligned to |width|: bright digits, dim unit
function sizeCell(bytes, width) {
    var size = formatSize(bytes);
    var unit = /[KM]$/.test(size) ? size.slice(-1) : '';
    var digits = unit ? size.slice(0, -1) : size;
    return repeat(' ', Math.max(0, (width || 0) - size.length)) + C.size + digits + C.sizeUnit + unit;
}

function fit(s, w) {
    s = s || '';
    return s.length > w ? s.slice(0, w) : s + repeat(' ', w - s.length);
}

function padStart(s, w) {
    s = String(s);
    return repeat(' ', w - s.length) + s;
}

//  Word-wrap to |width|, hard-splitting words longer than a line
function wrap(text, width) {
    var out = [];
    var line = '';
    var words = String(text || '').split(/\s+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) {
        var w = words[i];
        while (w.length > width) {
            if (line) {
                out.push(line);
                line = '';
            }
            out.push(w.slice(0, width));
            w = w.slice(width);
        }
        if (!line) {
            line = w;
        } else if (line.length + 1 + w.length <= width) {
            line += ' ' + w;
        } else {
            out.push(line);
            line = w;
        }
    }
    if (line) {
        out.push(line);
    }
    return out.length ? out : [''];
}

//  FILE_ID.DIZ-style descriptions: a preformatted block (up to 10 lines of
//  45 columns, often with ASCII art) that must be shown as-is, not reflowed.
function dizLines(desc) {
    if (!desc || !/\n/.test(desc)) {
        return null;
    }
    var lines = desc
        .replace(/\r\n?/g, '\n')
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') //  no stray ANSI in the list
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
        .split('\n')
        .map(function (l) { return l.replace(/\s+$/, ''); });
    while (lines.length && !lines[lines.length - 1]) {
        lines.pop();
    }
    while (lines.length && !lines[0]) {
        lines.shift();
    }
    return lines.length > 1 ? lines : null;
}

//  One readable line for a description: for a DIZ, the first line with real
//  words (logo rows of block characters are skipped); otherwise the text
//  with whitespace collapsed.
function descSummary(desc) {
    var lines = dizLines(desc);
    if (!lines) {
        return (desc || '').replace(/\s+/g, ' ').trim();
    }
    var wordy = lines.filter(function (l) {
        return /[A-Za-z]{3,}/.test(l) && (l.match(/[A-Za-z]/g) || []).length >= l.trim().length / 2;
    })[0];
    return (wordy || lines[0]).trim();
}

//  Printable length of a string containing SGR codes
function visibleLength(s) {
    return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
}

//  The CP437 byte a character stands for, as v3.file.read/readMember hand
//  text over: below 0x80 the character itself, above it the Unicode form of
//  a CP437 byte (ViSiON/3's ansi.Cp437ToUnicode, copied here). For binary
//  fields such as a SAUCE record's width and flags. 0 for anything else.
var CP437_HIGH = [
    0x00C7, 0x00FC, 0x00E9, 0x00E2, 0x00E4, 0x00E0, 0x00E5, 0x00E7,
    0x00EA, 0x00EB, 0x00E8, 0x00EF, 0x00EE, 0x00EC, 0x00C4, 0x00C5,
    0x00C9, 0x00E6, 0x00C6, 0x00F4, 0x00F6, 0x00F2, 0x00FB, 0x00F9,
    0x00FF, 0x00D6, 0x00DC, 0x00A2, 0x00A3, 0x00A5, 0x20A7, 0x0192,
    0x00E1, 0x00ED, 0x00F3, 0x00FA, 0x00F1, 0x00D1, 0x00AA, 0x00BA,
    0x00BF, 0x2310, 0x00AC, 0x00BD, 0x00BC, 0x00A1, 0x00AB, 0x00BB,
    0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
    0x2555, 0x2563, 0x2551, 0x2557, 0x255D, 0x255C, 0x255B, 0x2510,
    0x2514, 0x2534, 0x252C, 0x251C, 0x2500, 0x253C, 0x255E, 0x255F,
    0x255A, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256C, 0x2567,
    0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256B,
    0x256A, 0x2518, 0x250C, 0x2588, 0x2584, 0x258C, 0x2590, 0x2580,
    0x03B1, 0x00DF, 0x0393, 0x03C0, 0x03A3, 0x03C3, 0x00B5, 0x03C4,
    0x03A6, 0x0398, 0x03A9, 0x03B4, 0x221E, 0x03C6, 0x03B5, 0x2229,
    0x2261, 0x00B1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00F7, 0x2248,
    0x00B0, 0x2219, 0x00B7, 0x221A, 0x207F, 0x00B2, 0x25A0, 0x00A0,
];
var CP437_BYTE = null;
function cp437Byte(ch) {
    var code = ch.charCodeAt(0);
    if (code < 0x80) {
        return code;
    }
    if (!CP437_BYTE) {
        CP437_BYTE = {};
        for (var i = 0; i < CP437_HIGH.length; i++) {
            CP437_BYTE[CP437_HIGH[i]] = 0x80 + i;
        }
    }
    return CP437_BYTE[code] || 0;
}
