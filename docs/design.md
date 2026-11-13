# CARRiER (design)

A war dialer door game for ViSiON/3, first built for City of Thieves. The caller sits at a DOS box in
1993: they set a prefix in **CARRiER** (our ToneLoc-style scanner), watch the
scan come back, and dial what they find in **CoT-TERM** (our Telix/Procomm-
style terminal). Every host on the other end is emulated, written by us, and
looks the way those systems looked. Nothing ever dials a real number.

It runs as a VPL script door on our ViSiON/3 build, reached from the doors
menu.

## Decisions

1. **Names.** The scanner is CARRiER, the terminal is CoT-TERM. Homage, not
   copies: no ToneLoc, Telix or Procomm names or screens reproduced exactly.
2. **Real area codes, made-up numbers.** Prefixes look like real 1990s NPA-NXX
   (`1-512-555-XXXX`), so it feels right. Every number's contents come from
   our generator; the game never touches a phone line.
3. **One shared phone network per season.** Everyone scans the same network,
   generated from a season seed. Only finds and player state are stored, not
   the network, so `v3.data` stays small. Shared means discoveries are a race.
4. **Play as long as you like, with a daily rhythm.** Free local minutes
   refill each day (the reason to come back daily, as LORD's forest fights
   are). Past them, a caller keeps playing by spending minutes they've banked
   or burning calling card codes. Grinding is allowed; it just costs.
5. **Busts are a time-out, not a wipe.** Getting caught grounds you ("your
   parents took the modem") for a while. You lose the codes you were carrying,
   never your rank, rep or finds. Codes stashed in a voicemail box are safe.
6. **The notebook points at our archive.** At a login prompt the narrator
   mutters ("A DEC box. I had notes on these somewhere") and F1 opens the
   notebook: a note per kind of system, naming the real text file in our file
   areas that tells you how to get in. The game only accepts the defaults
   those files list (`DEFAULTS` in carrier_net.js says which file each list
   came from). More notes unlock by rank; a system with no note yet says
   "Nothing in here about Prime. Not yet." The 617-455, 617-585 and 617-556
   exchanges are full of Primes because primes.txt says to hunt there.
7. **Graphics are DOS software, not the CoT menu set.** The game screens are
   ours, drawn by our art script in DOS colours. The artist's menu art isn't
   touched; the game just gets a door menu entry.

## Currency

| Currency | What it is | Where it comes from | What it buys |
|---|---|---|---|
| **Minutes** | Phone time, the fuel. Every dial costs some: a local call little, long distance more. | A free daily allowance (refills at midnight); banked leftovers, up to a cap. | Scanning and dialing. |
| **Codes** | Calling card and extender codes. Long distance for free, and the key to raid targets. | Loot: PBX outdials, hacked accounts, trashing finds, raid rewards. | Long-distance scans without minutes; entry to raids. Each code has a few uses, and the telco kills it if heat gets high. |
| **Rep** | Standing in the scene; the score. Never spent. | Finds (weighted by rarity, x3 for first to find), break-ins, loot, raids. | Rank, the leaderboard, unlocking harder targets. |
| **Cash** | Money from the fence. | Selling loot on The Hack Shack; some badges. | Gear (phase 3). |

Rep is never spent down: gear is bought with cash, so selling loot never
costs you standing. Faster modems still come free with rank too.

## Flow

1. **Boot.** A fake DOS screen: `C:\>CD \CARRIER`, the config loading, the
   splash. Then the **Scene Daily**: what happened since you last called
   ("Felonius got busted in 512-555", "disconnex found a VAX in 213-874",
   raid progress).
2. **Setup** (CARRiER's blue setup screen): dial mask, range, carrier or tone
   mode, which modem, which code to dial through.
3. **Scan.** A live log scrolls (`14:02:26  555-0149  ** CARRIER **`), a
   counter box tracks Dialed / Busy / Voice / Carrier / Tone / Timeout and
   minutes left, and the **tone map** (a grid of the exchange in `░▒▓█`)
   fills in. Space skips a number, Esc stops. Random moments happen mid-scan:
   a wrong number, an operator breaking in, line noise.
4. **Found list.** A lightbar of what turned up, with who found each first.
5. **Dial** in CoT-TERM: `ATDT 5550149`, `CONNECT 2400`, a status bar along
   the bottom (`Alt-Z Help │ ANSI │ 2400 N81 │ FDX │ Online 00:42`), then the
   host.
6. **Hang up** (`NO CARRIER`), back to the found list.

## Hosts

| Host | What you see | Way in | Worth |
|---|---|---|---|
| DEC VAX/VMS | `Username:`, DCL `$` | `SYSTEM/MANAGER`, `FIELD/SERVICE` | high |
| Unix System V / BSD | `login:` | `root`, `uucp`, `guest`, `sync` | high |
| Prime PRIMOS, HP3000 MPE, DG AOS/VS, IBM VM/CMS | their own logins | factory defaults | high |
| Telenet / Tymnet PAD | `TELENET 214 22A`, `@` | none needed | a jump to other systems |
| PBX (Definity, Meridian, ROLM) | maintenance login, or a second dial tone | defaults, codes | outdial: codes |
| Voicemail (Octel / Aspen) | menus as text | default box passwords | your stash, safe from busts |
| COSMOS | the phone company's database | hard | very high, very hot |
| BBSes | fake boards with fake sysops | new user | some are sting boards |
| Fax, loops, ANAC, test tones | noise | none | small |

The ways in are the real historical defaults from the old textfiles, and
those textfiles are in our file archive: reading Phrack and LOD here makes
you better at the game. Logged-in hosts have small shells (DCL, sh, the PBX
menu) with loot to find: password files, number lists (new targets), codes.

## Heat and busts

- Each dial adds heat to that exchange for you; heat cools every day.
- Some targets run hot (COSMOS, phone company numbers) and some are traps
  (sting boards, a "this call is being monitored" line).
- Past a threshold, a bust: grounded for a time-out (hours, longer for repeat
  offenders), carried codes lost, and the bust is in the Scene Daily.
- A blue box and dialing through codes or a PAD lower the heat you pick up.

## The hook (what LORD does, and our version)

| LORD | CARRiER |
|---|---|
| Daily forest fights | Daily free minutes |
| Daily Happenings | The Scene Daily, and big moments in the lore line above the prompt |
| Masters you fight to level up | **Rank tests**: an elite handle from the scene sets a job before you can move up ("get me into a Prime") |
| Attacking other players | Taking over a box someone else owns by changing its password; trading codes; tipping off the telco about a rival (risky: it can come back on you) |
| The bank | Your voicemail stash |
| The Red Dragon | The **season boss**: the phone company's own master system. The first to crack it wins the season, the Hall of Fame records it, and the network reseeds. |
| IGMs, random events | Raids, and random moments mid-scan |

## Raids

Board-wide events against big targets: an elite BBS, a corporate mainframe,
a phone company switch. A raid opens for a weekend, announced in the Scene
Daily. It needs pieces that different callers find: its dial-in (from
scanning a given prefix), an account (from loot), codes to reach it. A shared
progress bar fills as callers bring pieces. When it completes, everyone who
contributed gets rep and codes, and the top contributors are named.

## Ranks and the leaderboard

- Lamer → Wannabe → Phreak → Hacker → Elite → Legion at 0, 100, 400, 1200,
  3000 and 8000 rep (rank tests come in phase 2).
- The leaderboard ranks by rep for the season. Categories: most carriers,
  best find, most first-finds, raid MVP.
- Seasons run a month or until the boss falls. Rep resets each season;
  ranks, the Hall of Fame and lifetime stats don't.
- The Top 10 board shows the CARRiER leaderboard as one of its categories,
  read straight from the game's `v3.data` file.

## Building it

- A `v3_script` door with modules through `@include`: the network generator
  (seeded RNG), one module per host type, the screens, scoring, the Scene
  Daily.
- Uses our build's `v3.console.readkey` for lightbars and Esc/Space mid-scan,
  `v3.util.sleep` for scan timing, `v3.ansi` for the screens, `v3.data` for
  players, finds, raids and the leaderboard (safe with several callers at
  once).
- The door gets a longer `max_run_minutes`.
- Built and played on a local test board first, then on City of Thieves.

## Phases

1. **Playable core** (built: src/carrier.js and src/lib/carrier_*.js). Boot and the Scene Daily, setup, scanning with the log
   and tone map, found list, CoT-TERM, about six host types with default-
   password break-ins, minutes and rep, busts as time-outs, the leaderboard.
2. **Depth** (built). Each system has a way up, leads and loot:
   - VMS: mail gives away a privileged account and a backup node's number;
     a privileged user can read SYS$MANAGER:MODEMS.LIS and run AUTHORIZE.
   - UNIX: mail gives root's password for `su`; uucp or root can read
     /usr/lib/uucp/L.sys, numbers with logins.
   - Prime: MEMO.TXT points at SYSOVL>BACKUP.CPL, a batch job with the
     SYSTEM password in it; privileged users get DIALUPS.TXT.
   - HP3000: PRINT BACKJOB shows a job stream's logon and password; NOTES
     lists remote sites.
   - System 75: DIS REM gives a barrier code and its DISA dial-in.
   Leads land on the found list. Codes: dial the DISA line, enter the code,
   and the next call is free with half the heat; a scan can run through one
   too. A code has 6 uses and can burn when you're hot. Voice mail (ASPEN,
   Octel, Audix): take an empty box with a default password (aspen.txt) and
   it's your stash, safe from busts. Rank tests: Phreak needs a login,
   Hacker privileged access on a VAX, UNIX or Prime, Elite a call through
   a code, Legion a stashed code (made-up scene handles set them).
   Modems by rank: 2400, 9600 at Phreak, 14.4 at Hacker.
3. **The fence, gear and badges** (built).
   - **Cash.** Rep stays the score and is never spent; cash is what you buy
     with. Loot (password files, account lists, number lists) goes into your
     wares, and the fence on **The Hack Shack**, a board in your home area
     code that's on your found list from the start, buys it. The first to
     sell a piece of a system's loot gets the full price, and each seller
     after gets less.
   - **Gear** from the Hack Shack:
     - modems: USR Courier HST 9600, then a V.32bis 14.4 (rank still gives
       them free later)
     - scanner upgrades: an exclusion list (skips numbers already scanned
       or found), nudge strings (a few lines that time out are quiet
       carriers), tone detect (a few that ring out are tone lines)
     - a blue box: free long distance into a crossbar exchange; an ESS
       exchange hears the 2600 Hz and the heat comes down hard
     - red boxes: one call "from a payphone", no heat from it
     - beige boxes: clip onto a neighbour's line, a big heat drop
     - Crack 4.1: run it on a stolen /etc/passwd; after a while it gives
       accounts on that system, and a reused password on one of its
       neighbours
     - a shell on a public-access UNIX: a bust takes half your codes, not all
     - zines: Phrack and LOD/H TJ issues add notebook pages naming real
       files in our file areas (issue and article title, never authors)
   - **Badges**, about 25, announced in the Scene Daily and kept on a wall
     in the You screen. Some pay cash.
   - **Deeper UNIX**: an admin is sometimes on (`who`, `finger`, `w`) and
     each command while he is costs heat; `.rhosts` trusts a sister host
     that `rlogin` reaches with no password; as root, emptying wtmp covers
     your tracks.
   - **Deeper VMS**: the system manager is sometimes on (`SHOW USERS`);
     `SHOW NETWORK` lists DECnet nodes and `SET HOST` reaches them without
     dialing; as SYSTEM, deleting the accounting file covers your tracks.
4. **The wider network** (built).
   - **Packet networks.** `SCAN <area> <from>-<to>` at a Telenet PAD's `@`
     runs CoT-TERM's SCAN.SCR over up to 100 addresses (a local minute per
     ten); hosts that answer land on the found list. About a third of PADs
     are Tymnet: "please log in:" takes a host number, and SCAN works there
     too.
   - **COSMOS**, the phone company's database of every line, on a few of
     its exchanges. From the archive (cosmos.phk, cosmoslg.txt): `;LOGIN:`,
     `PASSWORD:` (none for some accounts), a two-letter wire center, then a
     `wc%` prompt. A phone company UNIX box's notes give the number, login
     and wire center. `ISH TN <number>` shows what's on any line (data,
     PBX, residence), who it's for and its switch, without dialing it;
     `SIR LCC DATA <nxx>` lists an exchange's data lines as leads. Every
     command costs heat.
   - **Live sysops.** An admin who's on notices after a few commands and
     sends a message; from then on he may throw you off (heat +10). Talk
     your way out with `write <admin>` on UNIX or `PHONE SYSTEM` on VMS: a
     story that fits (field service, a backup, a vendor) works more often
     than not, and he leaves you alone for the rest of the call.
5. **The scene** (built).
   - **Seasons** run 30 days, or end the day someone cracks the boss. The
     next season's seed comes from the last, so nodes rolling it over at
     once agree. Rep, finds, codes, voice mail and wares reset; badges,
     gear, cash, the rank title (a floor) and lifetime totals carry over.
   - **The Hall of Fame** keeps each season: the top of the board, who
     cracked the boss, and each raid's ringleader.
   - **Raids**: four a season, one at a time (The Lost City, Operation
     Night Owl, Granite Mainframe, Operation Ma Bell). Each needs its
     dial-in (a carrier in a named exchange, found by scanning), an
     account (a piece of loot of the named kind) and 2 to 5 barrier codes,
     from any number of callers. Each piece is its own key, so nodes can't
     drop each other's; contributors claim rep and cash per piece on their
     next visit, and the one who brought the most is the ringleader.
   - **The season boss**: a city's Switching Control Center, a carrier on
     a phone company exchange (the Scene Daily says which exchange when the
     season opens). Its login goes to everyone who helped with Operation Ma
     Bell; the first in wins the season (+1000 rep, $500, the Ma Bell
     badge).
   - **Rivals**: tip off the phone company about someone ($50, heat +20
     on them, three times in ten it comes back on you), or give someone a
     code. Both land when they next play.
   - **The Top Ten**: its own door on the doors menu (`t`), with callers,
     posters, uploaders and downloaders, and CARRiER's rep and first
     finds read from the game's store.
6. **Real systems** (in progress: steps 1 and 2 of 7 live on City of Thieves,
   step 3 built;
   see Real systems below). Every host gets a filesystem and a shell like
   the real one, and what players leave on them now lasts (step 3).

## Real systems (phase 6, in progress)

Phases 1 to 5 made the systems answer like their real counterparts at the
login prompt, and their shells hold a way up, leads and loot. Inside, though,
each shell is a short list of commands with fixed replies. There is no
filesystem: `cd` does nothing, `ls` prints one of a few lists, and `cat` reads
only the files the game expects. Every UNIX box has the same `notes` and the
same mail with a different password in it. A curious player hits a wall in
a minute, and nothing they do leaves a mark.

Phase 6 makes each system a place: a filesystem to wander, commands that
work on it, a little of the people who use it, and room for players to leave
things behind. The game's three finds (a way up, leads, loot) stay, but
they become files you have to go looking for.

### The test of it

A player who knows the real system should be able to use it the way they
would have in 1993 and not run into the edges. That means:

- Commands work on any file, not just the expected ones: `ls -l` anywhere,
  `cd ..`, `more` on a long file, `grep` for a word across a directory.
- Every machine is different: its users, its mail, its jobs, what it's for.
  Two VAXes at two universities shouldn't read the same.
- Errors are the real ones, worded as that OS worded them.
- What isn't there is missing the way it would be: a permission denied, an
  empty directory, a command not found. Never a game message.

### A filesystem on every host

Generated, not stored. A host's files come from three layers, all derived
from the season seed and the host's number, so nothing needs saving:

1. **The OS skeleton.** A tree per system, as shipped:
   - UNIX (System V and BSD differ): `/bin`, `/etc` (`passwd`, `group`,
     `motd`, `rc`, `inittab` or `ttys`), `/usr/adm` (`wtmp`, `sulog`,
     `pacct`, `messages`), `/usr/spool/mail`, `/usr/spool/cron/crontabs`,
     `/usr/lib/uucp`, `/tmp`, home directories.
   - VMS: `SYS$SYSDEVICE:[SYSMGR]`, `[SYSEXE]` (`SYSUAF.DAT`, readable only
     with privileges), `SYS$MANAGER:` (`SYSTARTUP_V5.COM`, `MODEMS.LIS`),
     user directories `[USERS.NAME]`, `.COM` command files, `.LOG`s, the
     accounting file.
   - PRIMOS: the MFD, UFDs per user, `SYSOVL`, `CMDNC0`, `.CPL` files.
   - HP3000: accounts, groups and files (`BACKJOB.PUB.SYS`), `LISTF`.
2. **The organization.** The exchange's profile decides what the machine is
   for and fills it accordingly:
   - university: course directories, a thesis draft, a computing center
     newsletter, students' `.plan`s, a games directory
   - business: payroll and inventory reports, a sales forecast, memos about
     the new system
   - government: memos with routing headers, a contract file index, a
     security bulletin that's months out of date
   - phone company: frame room notes, trouble tickets, switch reports, test
     line lists
3. **This host.** Its users (already generated) get home directories with
   things in them: mail threads between them, a `.profile` or `LOGIN.COM`,
   a half-written report, a crontab. Each user has a habit or two (one
   keeps passwords in a file called `stuff`, one never logs out, one writes
   angry mail to the admin), so their files tell a little story.

Text comes from templates with fill-ins, enough of them that a phrase
doesn't repeat often. Files are made only when read: a directory lists
names and sizes, and a file's text is generated when it's opened.

**The way up, leads and loot move into the files.** Instead of being in
the one place the game knows, each host hides them in one of several
plausible places, chosen per host:

- the way up: an admin's mail, a backup script with a password in it, a
  `.netrc`, a batch job, a sticky-note file in a home directory, a
  password reused from a user whose password you have
- leads: L.sys, a modem list, a `.rhosts`, an old mail with a dial-in, a
  phone list in a secretary's directory
- loot: the password file, an account list, the thing the organization
  would least want taken (payroll, a contract index, a switch report)

So a player can't learn one command per OS and farm it; they learn how
those systems were laid out and where people left things.

### Shells that feel like the real ones

Each OS gets the commands a user of the time typed, 30 or 40 each, working
on the filesystem above. For UNIX:

`ls` (with `-l`, `-a`, `-R`), `cd`, `pwd`, `cat`, `more`, `head`, `tail`,
`grep`, `find` (by name), `wc`, `file`, `strings` (on a binary: a few
readable lines, sometimes a password), `who`, `w`, `finger`, `last`, `ps`
(`-ef` or `aux` by flavor), `id`, `uname`, `date`, `mail`, `write`, `talk`,
`su`, `passwd`, `crontab -l`, `rlogin`, `cu` (an outdial, see below),
`echo`, `cp`, `mv`, `rm`, `mkdir`, `chmod`, `ed` (line mode), `history`
on csh, `man` (a short page for each), `exit`.

For VMS the same in DCL: `DIRECTORY` (with `/FULL`, `/SIZE`), `SET
DEFAULT`, `TYPE`, `TYPE/PAGE`, `SEARCH`, `SHOW USERS`/`SYSTEM`/`NETWORK`/
`PROCESS`/`DEFAULT`, `MAIL` with its own prompt, `PHONE`, `COPY`,
`DELETE`, `CREATE`, `EDIT/EDT` (line mode), `SET HOST`, `RUN AUTHORIZE`,
and `HELP` with topics. PRIMOS and MPE get theirs too.

Commands understood but out of reach answer as the system would (`Not
owner`, `%DCL-W-INSPRIV`); anything else gets that OS's not-found error.
The admin watching (phase 4) still counts each command.

`cu` and the like are a new way to move: some UNIX boxes have a dial-out
modem, and calling out through one costs no minutes and less heat, which
is why people went looking for them.

### Leaving a mark

Players' changes are kept on top of the generated files, per host, in the
game's `v3.data` store. Everyone scans the same network, so what one
player leaves, the next player in finds.

What a player can do:

- **Make files**: `cat > file`, `echo text > file`, `ed`, `CREATE`. A tag
  in `/tmp`, a note to whoever comes next, a textfile of your own.
- **Plant a backdoor**: add an account to `/etc/passwd` (with `ed`, the
  way it was done), an entry in SYSUAF with AUTHORIZE, a `.rhosts` with
  `+ +`. Next time, you log in with it and skip the hunt.
- **Take a box**: change the admin's password (the "taking over a box"
  idea from the hook table). The next player finds the old one doesn't
  work. Taking it leaves a trail, where it would have been in 1993: root's
  shell history holds what was typed as root (the `passwd`, the backdoor
  line), `sulog` names the account they came in on, and the password file
  carries the new password's hash, which Crack breaks if it's a word, a
  user's name, or six lowercase letters or fewer. A taker who cleans up
  and picks a good password holds the box longer.
- **Leave mail**: in-game mail on a host reaches another player who logs
  in there.
- **Be seen**: `who`, `w` and `last` include other CoT callers who are on
  the same host right now or were lately, under the account they used.
  Two players on one VAX at once can `write` each other.

Files a player makes show their account as the owner, and their handle
only if they wrote it in. A file can be hidden the way people hid things:
a dot file, a directory called `...`, a name that looks like a system file.

**The admins clean up.** Once a day, when the season's daily tick runs:

- `/tmp` is emptied.
- Each backdoor, planted file and taken box has a chance of being found.
  The chance depends on the organization (a government box is watched, a
  forgotten business machine isn't), on how hidden it is, and on how much
  heat its owner has. A thing that's found is removed, the motd may grow a
  security notice, the owner picks up heat on their next call, and a big
  one makes the Scene Daily.

Hiding well is a skill, and a backdoor is worth having but never safe.

**Players fight over boxes.** Anyone who gets in can find and remove
another player's backdoor, delete their files, change the password they
set, or lock the box down behind them, as people do in real CTFs however
often they're told not to. It stays a fight, not a dead end:

- Nothing a player does closes a box for good. Its generated way in
  (the default account, the mail, the backup script) stays where it was,
  so a box someone took can be taken back the way they took it.
- A flag can't be removed or changed. Whatever else happens to a box,
  its flag is still there for the next player.
- Whoever loses a backdoor or a box hears about it on their next call
  ("your account on HADES is gone"), but not who did it. They can find
  out the way they would have: `last`, the logs, a file left behind.
- Holding a box pays: rep each day it's still yours when the admins
  sweep. That makes the hold worth fighting for.

**Limits.** `v3.data` is one JSON file, and 0.9.7 caps it at 4 MB. A
host's changes: at most 16 files and 8 KB of text. A player: at most 20
planted things across the network, oldest dropped first. All of it resets
with the season, as the network does: nothing planted carries over, not
even on the landmarks. The Hall of Fame is what lasts.

### Landmarks

Most of the network stays generated. A few exchanges get hand-written
hosts, at the real period exchanges of real places, under stand-in names
that leave no doubt who they are. Each is a set piece: a bigger, stranger
filesystem, its own story, and the hardest ways in.

Candidates (every exchange to be checked against period sources first):

- **The Institute**, Cambridge, 617: an AI lab machine with the old
  open culture, no passwords on some accounts, and students' hacks lying
  around; next door, the Institute's lab in Lexington.
- **The Fort Meade facility**, 301: almost unbreakable, very hot, and the
  outermost machine is a honeypot that logs everything you type and says
  so on your way out.
- **Kunia**, 808: the same agency's Pacific outpost, reached only through
  a lead from inside the facility.
- **The Lab**, Berkeley, 415: the 1986 honeypot story, its fake project
  files still on disk for anyone who knows what to look for.
- **The Beltway**, 703: defense contractors' machines, the Pentagon's
  neighbors, government profile, rich loot, fast admins.
- **The Mesa**, 505: a national lab, a VMS cluster, classified-looking
  directories that are empty.
- Silicon Valley (408), Research Triangle (919) and Oak Ridge (615) as
  lesser landmarks.

The area codes not already in the game are added with their 1993 cities.

### CTFs

A season can carry a CTF: a chain of five to eight flags across the
landmarks and generated hosts.

- A flag is a line of text in a file. Reading it records it; the first
  reader of each flag gets rep and cash, later readers less.
- Each flag points at the next: an exchange, a host name, a user to
  finger, a password to try, a textfile in our archive to read.
- The puzzles use the game's own skills: cracking a stolen passwd file,
  reading L.sys, a COSMOS lookup, `strings` on a binary, a ROT13 or
  uuencoded file, a `.plan`, VMS mail.
- If nobody has found the next flag after a few days, the Scene Daily
  drops a hint, then a stronger one.
- The Top Ten gets a CTF list, and the Hall of Fame records who finished
  first.
- Each CTF is a data file (`scripts/data/carrier/ctf/`), so a sysop can
  write a new one without touching code.

### Easter eggs

Small things found by curiosity, worth little or nothing but a badge
(Archaeologist, for finding five):

- `.plan`s and motds that quote a line from a textfile in our archive
  (one line, credited the way the file credits itself)
- a `games` directory with something that half works
- `fortune` with scene fortunes we write ourselves
- an abandoned phreak's home directory with a half-finished textfile
- a host that is City of Thieves itself, as it might have looked in 1993
- period news in motds and mail: Sundevil, the E911 document, the
  Legion of Doom trials, as the people on those machines would have
  talked about them

Nods, never copies: no other game's or film's text reproduced.

### Building it

In steps, each playable:

1. **The filesystem engine** (live on City of Thieves 2026-11-07:
   src/lib/carrier_fs.js and carrier_unix.js). The tree, lazy file text, permissions, wildcards, and
   a Bourne shell on top with about 45 commands. Four layouts: System V
   Release 3, Release 4 (a shadow file only root reads), 4.3 BSD (L.sys,
   no uname) and SunOS 4.1, plus IRIX, NeXTstep and UNICOS (below). Root's password is in one of four places per
   host (the admin's mail, a backup script, a .netrc, a user's file of
   passwords) and the caller's mail points at it; leads in Systems or
   L.sys and a user's phone list; loot in the password file and a
   staff-only file per organization (grades, payroll, a contract index,
   a switch report), which the fence buys. Writes last the call. With a
   real shell, an admin who's on now notices looking around (ls, cd, who)
   at a third of the weight of reading and running things.
2. **VMS, PRIMOS and MPE** on the same engine (live on City of Thieves 2026-11-07:
   carrier_vms.js,
   carrier_prime.js, carrier_mpe.js; the old shells are gone from
   carrier_hosts.js).
   - VMS: DUA0: with the system root under it (SYS$MANAGER:,
     SYS$SYSTEM: and the other logical names), a directory per user,
     versions, protection codes. DCL takes abbreviations and
     qualifiers: DIRECTORY (/SIZE /DATE /OWNER /PROTECTION /FULL, and
     [*] and [...] wildcards), TYPE (/PAGE; .LIS is the default type, as
     it was), SEARCH, COPY, RENAME, DELETE (wants a version), CREATE and
     CREATE/DIRECTORY, SET DEFAULT/PROTECTION/PASSWORD/PROMPT/HOST, SHOW
     USERS/SYSTEM/NETWORK/PROCESS/QUOTA/LOGICAL/DEVICES/INTRUSION, MAIL
     (DIR, READ, SEND, EXTRACT), EDT in line mode, PHONE, RUN and MCR,
     AUTHORIZE (SHOW, LIST to a file, ADD). The privileged account is in
     a mail message, in a DECnet access control string in a world-readable
     command file, or in a user's password list. Deleting
     SYS$MANAGER:ACCOUNTNG.DAT still covers your tracks.
   - PRIMOS: a partition's MFD of UFDs (CMDNC0, SYSOVL, SAD, one per
     user), <VOL>UFD>FILE paths, ACLs (LIST_ACCESS, SET_ACCESS), ATTACH,
     LD (-DETAIL), SLIST, COPY, DELETE, CREATE, ED, STATUS, MESSAGE,
     NETLINK to other PRIMENET nodes, EDIT_PROFILE; OK, and ER! after a
     mistake. SYSTEM's password is in a CPL batch job, a user's command
     input file, or a password list; a memo in your UFD points the way.
   - MPE: accounts, groups and FILE.GROUP.ACCOUNT names with @ ? #
     wildcards, LISTF (levels 0-2), PRINT, CHGROUP, PURGE, BUILD,
     RENAME, SHOWME, SHOWJOB, TELL, LISTUSER (shows passwords to a
     system manager, and the organization's users log on with them),
     LISTACCT, REPORT, FCOPY and EDIT/3000. MANAGER.SYS's password is in
     a job stream's !JOB line or a password list, and the operator's
     welcome message says too much. PURGE LOG@.PUB.SYS covers your
     tracks.
   - The admin talks each system's way (PHONE, MESSAGE, TELL), and in
     CoT-TERM Ctrl/Z and Ctrl/D now reach the host.
   - More flavors of UNIX (built 2026-11-13, asked for on the V3Net
     thread): IRIX 4.0.5, NeXTstep 2.1 and UNICOS 6.1, taken from a UNIX
     host's own roll so the other hosts keep their versions (a few UNIX
     hosts found before this changed flavor). By profile: universities
     run all three, government IRIX and the odd Cray, business IRIX and
     NeXTs, homes a NeXT now and then; never the phone company.
     - IRIX: /usr/people, csh, SGI's banner and uname. 4Dgifts, lp, tour,
       tutor and demos are always in the password file, and a host may
       leave one with no password (hackfaq.txt), which logs in without
       asking for one.
     - NeXTstep: /etc is a link into /private/etc, which wheel can write,
       and "me" (home /me) is in wheel (cert9106.txt); a host may leave
       "me" with no password. /etc/passwd holds three single-user
       accounts; `nidump passwd .` prints the real ones out of NetInfo,
       for anyone (the loot), and `niutil -list . /users` lists them.
     - UNICOS: a Cray Y-MP. The passwords are in /etc/udb, which
       `udbsee` shows only to root (the loot). Logging in adds heat, and
       the prize is the CPU allocations (40 rep).
     The notebook has a page for each (hackfaq.txt, cert9106.txt,
     ciac.b17).
3. **Persistence** (built 2026-11-13: src/lib/carrier_keep.js; UNIX first,
   then VMS, PRIMOS and MPE the same day).
   Each host's changes are kept per season in the game's store, laid over
   the generated tree on the next call, and saved after every command, so
   two players on one box don't undo each other. Kept: files written,
   made, removed, moved and chmodded; root's password set with `passwd`
   (which locks the old one out of `su` and the root login); mail sent to
   an account there. A line with no password added to `/etc/passwd` (or
   with an empty shadow entry) is a login with no password, root if its
   uid is 0. A `.rhosts` or `/etc/hosts.equiv` holding `+` lets `rlogin`
   in from any UNIX box the player has found. `who`, `w` and `last` show
   other players on the host now or lately, under the account they used.
   A player whose file or password someone else changed is told so on
   their next game, but not by whom. Limits: 16 changed files and 8 KB per
   host, 20 changes per player (the oldest goes back).
   - VMS: `AUTHORIZE ADD` (default password USER, `/PRIVILEGES=ALL` for a
     privileged one) adds a backdoor account; `SET PASSWORD` as, or
     `MODIFY .../PASSWORD=` of, a privileged account takes the box. Each
     leaves a security alarm in `OPERATOR.LOG` naming the account that did
     it. `SHOW USERS` and `MAIL` reach other players.
   - PRIMOS: `EDIT_PROFILE`'s `ADD_USER name [-SAD]` and `CHANGE_PASSWORD`
     as SYSTEM, logged in `SAD>EDIT_PROFILE.LOG`; `STATUS USERS`.
   - MPE: `NEWUSER user;PASS=pw;CAP=SM` and `ALTUSER MANAGER.SYS;PASS=pw`
     (new commands, SM or AM only), logged in the newest `LOG####.PUB.SYS`,
     which `PURGE LOG@.PUB.SYS` takes away; `SHOWJOB`.
   - Crack runs on a stolen SYSUAF list or PRIMOS user list too, and gets
     any weak password a player set or any weak account a player added.
   - `ed` on UNIX is a real line editor (`a i c d p n s w q`, addresses,
     `/re/`), so a backdoor goes into `/etc/passwd` the way it was done.
   - Two players on one box can reach each other: `write` on UNIX, `PHONE`
     on VMS, `MESSAGE` on PRIMOS, `TELL` on MPE. The other side sees it at
     their prompt within a few seconds, as the host would print it.
4. **Admin sweeps** and hiding (built 2026-11-13: keepSweep in
   src/lib/carrier_keep.js). The first game of each day sweeps every host
   where players left something:
   - `/tmp` (and `/var/tmp`, `/usr/tmp`) is emptied.
   - Each other file, account and password a player left is found by
     chance: per day 35% on a government box, 40% at the phone company,
     15% at a university, 12% at a business and 5% at home, times how
     hidden it is (a third in a dot file or a `...` directory, 60% among
     the system's own directories, 130% for the password and trust files
     the admins check), times 1 + the owner's heat / 50. A taken password
     is a little less likely to be noticed (80%).
   - What's found goes back to how the host had it. Its owner hears about
     it on their next game, with heat (3 to 20 by organization, double for
     a taken password). A taken password that's found also puts a security
     notice on the login and makes the Scene Daily, with no names.
   - Logs and histories (sulog, root's history, `OPERATOR.LOG`,
     `EDIT_PROFILE.LOG`, MPE's `LOG####`) aren't swept: they're the trail.
   - Holding a box pays: each taken password that survives the day gives
     its holder 5 to 40 rep by organization.
5. **The landmarks**, a few at a time, with their area codes. Built so
   far (2026-11-13, src/lib/carrier_land.js), with the exchanges checked
   against period sources:
   - **The Institute**, 617-253 (its own exchange, its own switch since
     1988). FISHBOWL at 617-253-0042, a 4.3 BSD box in the AI lab: guest
     and tourist have no password, the motd welcomes tourists, students'
     hacks are in /usr/hacks, and root's password is on the whiteboard.
     A note there leads to the Institute's defense lab in Lexington
     (617-981, a government exchange).
   - **The Fort Meade facility**, 301-688 (the agency's best-known
     exchange, still 301 after Maryland's 1991 split to 410). TERMINUS at
     301-688-7140 is the honeypot: guest/guest gets in, it's full of
     compartmented-looking projects, every command adds heat, and it says
     on the way out that the session was recorded (heat +25). Its host
     table gives the inner VAX, ANTEROOM at 301-688-2600, whose one known
     account is the password TERMINUS's staff reused: steal TERMINUS's
     passwd, Crack it, and dial in, very hot. A note mentions Kunia, the
     next landmark.
   - The first login to a landmark pays a bonus (30 to 150 rep).
   - A season's boss and raids are drawn from the first sixteen area codes
     only (SEASON_NPAS), so adding area codes (301 here) never moves them.
6. **The CTF engine** and the first season's CTF (built 2026-11-13:
   src/lib/carrier_ctf.js; the format for sysops is in docs/ctf.md). The
   built-in CTF, Long Distance, has five flags: a dot file in a university
   box's uucppublic; a root-only ROT13 file on the machine that box calls
   at night (read its Systems or L.sys); a staff member's `.plan` on a
   company box (`finger` or `cat`); a string inside a program on a
   government box (`strings`); and a file on a university VAX. Each
   season finds hosts for them from its seed and keeps the placement.
   Flags can't be removed for good, and the sweep leaves them alone.
7. **Easter eggs**, added as we go.

## Open questions

- How long a time-out should be (a few hours? until tomorrow?).
- The free daily minutes and the cap on banked minutes; tune by playing.
- Which raids to write first.
- Phase 6: how much text variety the templates need before a regular
  player stops seeing repeats.
