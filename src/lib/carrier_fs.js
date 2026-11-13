//
//  CARRiER's filesystems (phase 6): a tree of directories and files for a
//  host, with owners and permissions, that the host's shell walks. A host's
//  tree is built from the season seed when a call connects (carrier_unix.js
//  builds a UNIX one); a file's text is made only when it's read. What the
//  caller changes goes into the tree, and carrier_keep.js keeps it for the
//  callers after them.
//
//  A node is a directory, a file or a symbolic link:
//    { dir: true, kids: { name: node }, own, grp, mode, mt }
//    { own, grp, mode, mt, size, text, type, onRead }
//    { link: '/var/adm' }
//  mode is the nine rwx characters ('rw-r--r--'). text is a string or a
//  function returning one. type is 'text' (the default), 'exec' or 'data'.
//  onRead(ctx, io), if set, runs once the caller has seen the file.
//  mt is a date as ls shows it.
//

//  A day in 1993, n days before today's date there, as ls prints it: the
//  time for the last six months, the year before that
function fsDate(daysAgo, r) {
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var now = new Date();
    var d = new Date(1993, now.getMonth(), now.getDate() - daysAgo, 0, 0, 0);
    var day = (d.getDate() < 10 ? ' ' : '') + d.getDate();
    if (daysAgo > 180) {
        return MON[d.getMonth()] + ' ' + day + '  ' + d.getFullYear();
    }
    var hh = r ? Math.floor(r() * 24) : 9;
    var mm = r ? Math.floor(r() * 60) : 14;
    return MON[d.getMonth()] + ' ' + day + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

function fsDir(own, grp, mode, mt) {
    return { dir: true, kids: {}, own: own, grp: grp, mode: mode || 'rwxr-xr-x', mt: mt || fsDate(30) };
}

function fsFile(own, grp, mode, text, mt, type) {
    return { own: own, grp: grp, mode: mode || 'rw-r--r--', text: text, mt: mt || fsDate(30), type: type || 'text' };
}

//  An executable: its size and the readable strings in it (strings(1))
function fsExec(own, grp, size, strs, mt) {
    var f = fsFile(own || 'bin', grp || 'bin', 'rwxr-xr-x', '', mt || fsDate(400), 'exec');
    f.size = size;
    f.strs = strs || [];
    return f;
}

//  Puts node at an absolute path, making the directories on the way
//  (owned by root) as needed. Returns the node.
function fsPut(root, path, node) {
    var parts = fsSplit(path);
    var d = root;
    for (var i = 0; i < parts.length - 1; i++) {
        if (!d.kids[parts[i]]) {
            d.kids[parts[i]] = fsDir('root', 'sys');
        }
        d = d.kids[parts[i]];
    }
    d.kids[parts[parts.length - 1]] = node;
    return node;
}

function fsSplit(path) {
    return String(path).split('/').filter(function (s) { return s !== ''; });
}

//  A path made absolute and tidied: '.', '..' and '//' resolved
function fsAbs(cwd, path, home) {
    var p = String(path);
    if (p === '~' || p.indexOf('~/') === 0) {
        p = home + p.slice(1);
    }
    var parts = (p.charAt(0) === '/' ? [] : fsSplit(cwd)).concat(fsSplit(p));
    var out = [];
    parts.forEach(function (s) {
        if (s === '..') {
            out.pop();
        } else if (s !== '.') {
            out.push(s);
        }
    });
    return '/' + out.join('/');
}

//  Whether who may do op ('r', 'w' or 'x') to node. who: { user, groups, root }
function fsCan(node, who, op) {
    if (who.root) {
        return op !== 'x' || node.dir || /x/.test(node.mode);
    }
    var at = { r: 0, w: 1, x: 2 }[op];
    var m = node.mode;
    if (node.own === who.user) {
        return m.charAt(at) !== '-';
    }
    if (who.groups.indexOf(node.grp) >= 0) {
        return m.charAt(3 + at) !== '-';
    }
    return m.charAt(6 + at) !== '-';
}

//  Looks a path up. Returns { node, path, parent, name } with node null when
//  the last part doesn't exist (parent set if its directory does), or
//  { err: 'denied' | 'notdir' | 'missing' } when the way there is barred.
//  Links are followed except for the last part when noFollow is set.
function fsLook(fs, cwd, path, who, noFollow, depth) {
    var abs = fsAbs(cwd, path, fs.home);
    var parts = fsSplit(abs);
    var d = fs.root;
    var walked = [];
    depth = depth || 0;
    for (var i = 0; i < parts.length; i++) {
        if (!d.dir) {
            return { err: 'notdir', path: abs };
        }
        if (!fsCan(d, who, 'x')) {
            return { err: 'denied', path: abs };
        }
        var n = d.kids[parts[i]];
        var last = i === parts.length - 1;
        if (n && n.link && !(last && noFollow) && depth < 8) {
            var rest = parts.slice(i + 1).join('/');
            var to = n.link.charAt(0) === '/' ? n.link : '/' + walked.join('/') + '/' + n.link;
            return fsLook(fs, '/', to + (rest ? '/' + rest : ''), who, noFollow, depth + 1);
        }
        if (!n) {
            if (last) {
                return { node: null, parent: d, name: parts[i], path: abs };
            }
            return { err: 'missing', path: abs };
        }
        walked.push(parts[i]);
        if (last) {
            return { node: n, parent: d, name: parts[i], path: abs };
        }
        d = n;
    }
    return { node: fs.root, parent: null, name: '/', path: '/' };
}

//  The path with the links on the way to its last part resolved, as
//  /etc/passwd is /private/etc/passwd on a NeXT
function fsReal(fs, abs) {
    var parts = fsSplit(abs);
    var d = fs.root;
    var out = [];
    for (var i = 0; i < parts.length - 1; i++) {
        var n = d && d.dir ? d.kids[parts[i]] : null;
        if (n && n.link) {
            var to = n.link.charAt(0) === '/' ? n.link : '/' + out.join('/') + '/' + n.link;
            return fsReal(fs, to + '/' + parts.slice(i + 1).join('/'));
        }
        out.push(parts[i]);
        d = n;
    }
    if (parts.length) out.push(parts[parts.length - 1]);
    return '/' + out.join('/');
}

//  A file's text (made the first time it's read)
function fsText(node) {
    if (typeof node.text === 'function') {
        node.text = node.text();
    }
    return node.text || '';
}

function fsSize(node) {
    if (node.dir) {
        return 512 * Math.max(1, Math.ceil(Object.keys(node.kids).length / 24));
    }
    if (node.link) {
        return node.link.length;
    }
    if (node.size !== undefined) {
        return node.size;
    }
    return fsText(node).length;
}

//  The type letter and mode, as ls -l starts a line
function fsModeString(node) {
    if (node.link) {
        return 'lrwxrwxrwx';
    }
    return (node.dir ? 'd' : '-') + node.mode;
}

//  Shell-style wildcards (* ? and [abc]) in any part of a path. Returns the
//  matching paths, sorted, or the word itself when nothing matches (as sh
//  does).
function fsGlob(fs, cwd, word, who) {
    if (!/[*?\[]/.test(word)) {
        return [word];
    }
    var abs = word.charAt(0) === '/';
    var parts = word.split('/').filter(function (s, i) { return s !== '' || i === 0; });
    var paths = [abs ? '/' : ''];
    parts.slice(abs ? 1 : 0).forEach(function (part) {
        var next = [];
        paths.forEach(function (base) {
            var join = function (n) { return base === '' ? n : base === '/' ? '/' + n : base + '/' + n; };
            if (!/[*?\[]/.test(part)) {
                next.push(join(part));
                return;
            }
            var look = fsLook(fs, cwd, base || '.', who);
            if (!look.node || !look.node.dir || !fsCan(look.node, who, 'r')) {
                return;
            }
            var re = fsPattern(part);
            Object.keys(look.node.kids).filter(function (n) {
                return re.test(n) && (n.charAt(0) !== '.' || part.charAt(0) === '.');
            }).sort().forEach(function (n) { next.push(join(n)); });
        });
        paths = next;
    });
    var hits = paths.filter(function (pth) { return !fsLook(fs, cwd, pth, who).err && fsLook(fs, cwd, pth, who).node; });
    return hits.length ? hits : [word];
}

function fsPattern(pat) {
    var s = '';
    for (var i = 0; i < pat.length; i++) {
        var c = pat.charAt(i);
        if (c === '*') {
            s += '.*';
        } else if (c === '?') {
            s += '.';
        } else if (c === '[') {
            var j = pat.indexOf(']', i);
            if (j < 0) {
                s += '\\[';
            } else {
                s += '[' + pat.slice(i + 1, j).replace(/\\/g, '\\\\') + ']';
                i = j;
            }
        } else {
            s += c.replace(/[.+^${}()|\\]/g, '\\$&');
        }
    }
    return new RegExp('^' + s + '$');
}
